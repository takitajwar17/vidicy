import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { Connector } from '@google-cloud/cloud-sql-connector';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { appRoot, migrationRoot, source, option, has, identifier, canonical, digest, writePrivateSnapshot, d1Query, reportError } from './google-migration-common.mjs';

const schemaText = await fs.readFile(path.join(appRoot, 'src/db/postgres-migrations/meta/0000_snapshot.json'), 'utf8');
const schemaHash = digest(schemaText);
const tables = Object.values(JSON.parse(schemaText).tables);
const byName = new Map(tables.map(table => [table.name, table]));
let connector;
let pool;

function tableOrder() {
  const done = new Set(); const ordered = [];
  while (ordered.length < tables.length) {
    const next = tables.find(table => !done.has(table.name) && Object.values(table.foreignKeys).every(key => key.tableTo === table.name || done.has(key.tableTo)));
    if (!next) throw new Error('Schema has a foreign-key dependency cycle');
    ordered.push(next); done.add(next.name);
  }
  return ordered;
}
function rowsInOrder(table, rows) {
  const selfKeys = Object.values(table.foreignKeys).filter(key => key.tableTo === table.name);
  if (!selfKeys.length) return rows;
  const done = new Map(selfKeys.map(key => [key.name, new Set()]));
  const pending = [...rows]; const ordered = [];
  while (pending.length) {
    const index = pending.findIndex(row => selfKeys.every(key => key.columnsFrom.some(column => row[column] === null) || done.get(key.name).has(JSON.stringify(key.columnsFrom.map(column => row[column])))));
    if (index < 0) throw new Error(`Foreign-key row cycle or missing parent in ${table.name}`);
    const [row] = pending.splice(index, 1); ordered.push(row);
    for (const key of selfKeys) done.get(key.name).add(JSON.stringify(key.columnsTo.map(column => row[column])));
  }
  return ordered;
}
function normalizeValue(column, value) {
  if (value === null) { if (column.notNull) throw new Error(`Source null in required column ${column.name}`); return null; }
  if (value === undefined) throw new Error(`Source column missing: ${column.name}`);
  if (column.type.startsWith('timestamp')) {
    // Legacy Drizzle SQLite mode "timestamp" stores epoch SECONDS. The live
    // source was inspected before migration; mode "timestamp_ms" is not used.
    const milliseconds = Number(value) * 1000;
    const date = new Date(milliseconds);
    if (!Number.isSafeInteger(milliseconds) || !Number.isFinite(date.getTime())) throw new Error(`Invalid source timestamp ${column.name}`);
    return date.toISOString();
  }
  if (column.type === 'boolean') {
    if (![0, 1, false, true].includes(value)) throw new Error(`Invalid source boolean ${column.name}`);
    return value === 1 || value === true;
  }
  if (column.type === 'jsonb') { try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { throw new Error(`Invalid source JSON ${column.name}`); } }
  if (column.type === 'integer' && !Number.isSafeInteger(value)) throw new Error(`Invalid source integer ${column.name}`);
  return value;
}
function normalizeRows(table, rows) {
  return rows.map(row => Object.fromEntries(Object.values(table.columns).map(column => [column.name, normalizeValue(column, row[column.name])])));
}
async function readSource() {
  const result = {};
  for (const table of tables) {
    const [{ count }] = await d1Query(`SELECT COUNT(*) AS count FROM ${identifier(table.name)}`);
    if (count > 100_000) throw new Error(`Source table exceeds reviewed migration limit: ${table.name}`);
    const columns = Object.values(table.columns).map(column => identifier(column.name)).join(', ');
    const rows = []; let after = '';
    while (rows.length < count) {
      const page = await d1Query(`SELECT ${columns} FROM ${identifier(table.name)} WHERE id > ? ORDER BY id LIMIT 50`, [after]);
      if (!page.length) break;
      rows.push(...page); after = page.at(-1).id;
    }
    if (rows.length !== count) throw new Error(`Source changed while reading ${table.name}`);
    result[table.name] = rows;
  }
  return result;
}
function validateForeignKeys(data) {
  for (const table of tables) for (const key of Object.values(table.foreignKeys)) {
    const parent = data[key.tableTo];
    if (!parent) throw new Error(`Foreign-key parent table missing for ${table.name}`);
    const values = new Set(parent.map(row => JSON.stringify(key.columnsTo.map(column => row[column]))));
    for (const row of data[table.name]) {
      const child = key.columnsFrom.map(column => row[column]);
      if (child.some(value => value === null)) continue;
      if (!values.has(JSON.stringify(child))) throw new Error(`Foreign-key source violation in ${table.name}`);
    }
  }
}
async function connectTarget() {
  let configuration = process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {};
  const instanceConnectionName = option('instance', process.env.CLOUD_SQL_CONNECTION_NAME);
  if (instanceConnectionName) {
    connector = new Connector();
    const options = await connector.getOptions({ instanceConnectionName, ipType: 'PUBLIC' });
    const password = process.env.PGPASSWORD ?? (await fs.readFile(option('password-file', path.join(migrationRoot, 'pg-password')), 'utf8')).trim();
    configuration = { ...options, user: option('user', process.env.PGUSER ?? 'vidicy'), database: option('database', process.env.PGDATABASE ?? 'vidicy'), password };
  }
  if (!configuration.connectionString && !instanceConnectionName && !process.env.PGHOST) throw new Error('Set DATABASE_URL, PGHOST or --instance');
  pool = new pg.Pool({ ...configuration, max: 1, connectionTimeoutMillis: 30_000 });
  const client = await pool.connect();
  await client.query('SELECT 1');
  return client;
}
async function targetCounts(client) {
  const counts = {};
  for (const table of tables) counts[table.name] = Number((await client.query(`SELECT COUNT(*) AS count FROM ${identifier(table.name)}`)).rows[0].count);
  return counts;
}
async function compareTarget(client, data) {
  for (const table of tables) {
    const columns = Object.values(table.columns).map(column => identifier(column.name)).join(', ');
    const rows = (await client.query(`SELECT ${columns} FROM ${identifier(table.name)} ORDER BY id`)).rows;
    if (digest(rows) !== digest(data[table.name])) throw new Error(`Target row contents differ in ${table.name}`);
  }
}
async function main() {
  if (has('inspect-target')) {
    const client = await connectTarget();
    try {
      const result = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name");
      console.log(JSON.stringify({ status: 'target-connected-read-only', publicTables: result.rows.map(row => row.table_name) }));
    } finally { client.release(); }
    return;
  }
  if (has('apply-schema')) {
    const client = await connectTarget(); client.release();
    await migrate(drizzle(pool), { migrationsFolder: path.join(appRoot, 'src/db/postgres-migrations') });
    console.log(JSON.stringify({ status: 'schema-applied', tables: tables.length }));
    return;
  }
  let snapshot;
  if (option('snapshot')) {
    snapshot = JSON.parse(await fs.readFile(option('snapshot'), 'utf8'));
    if (snapshot.schemaHash !== schemaHash || snapshot.databaseId !== source.d1_databases[0].database_id) throw new Error('Snapshot schema or source database identity differs');
  } else {
    // REST reads do not form a cross-request SQLite snapshot. Require two full,
    // identical reads and repeat this after the source write freeze at cutover.
    const first = await readSource();
    const second = await readSource();
    if (digest(first) !== digest(second)) throw new Error('Source changed between snapshot reads; freeze source writes and retry');
    snapshot = { capturedAt: new Date().toISOString(), schemaHash, databaseId: source.d1_databases[0].database_id, timestampUnit: 'seconds', data: first };
    const snapshotPath = await writePrivateSnapshot('d1-export', snapshot);
    console.log(JSON.stringify({ status: 'source-exported', snapshotPath, counts: Object.fromEntries(tables.map(table => [table.name, first[table.name].length])) }));
  }
  if (snapshot.timestampUnit !== 'seconds') throw new Error('Snapshot timestamp units are unsupported');
  const data = Object.fromEntries(tables.map(table => [table.name, normalizeRows(table, snapshot.data[table.name])]));
  validateForeignKeys(data); const ordered = tableOrder();
  if (has('export-only')) { console.log(JSON.stringify({ status: 'export-validated', rows: Object.values(data).reduce((sum, rows) => sum + rows.length, 0) })); return; }
  const client = await connectTarget();
  try {
    await client.query(has('apply') ? 'BEGIN ISOLATION LEVEL SERIALIZABLE' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    if (has('apply')) await client.query(`LOCK TABLE ${tables.map(table => identifier(table.name)).join(', ')} IN EXCLUSIVE MODE`);
    const counts = await targetCounts(client);
    const hasRows = Object.values(counts).some(count => count !== 0);
    if (hasRows) {
      if (!tables.every(table => counts[table.name] === data[table.name].length)) throw new Error('Target is nonempty and row counts differ; no data changed');
      await compareTarget(client, data);
      await client.query('COMMIT');
      console.log(JSON.stringify({ status: 'already-identical', counts })); return;
    }
    if (!has('apply')) { await client.query('ROLLBACK'); console.log(JSON.stringify({ status: 'dry-run-ready', targetCounts: counts, sourceRows: Object.values(data).reduce((sum, rows) => sum + rows.length, 0) })); return; }
    for (const table of ordered) {
      const columns = Object.values(table.columns);
      const sql = `INSERT INTO ${identifier(table.name)} (${columns.map(column => identifier(column.name)).join(', ')}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')})`;
      for (const row of rowsInOrder(table, data[table.name])) {
        const values = columns.map(column => column.type === 'jsonb' && row[column.name] !== null ? JSON.stringify(row[column.name]) : row[column.name]);
        await client.query(sql, values);
      }
    }
    await compareTarget(client, data);
    const finalCounts = await targetCounts(client);
    await client.query('COMMIT');
    console.log(JSON.stringify({ status: 'imported-and-compared', counts: finalCounts }));
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}
try { await main(); } catch (error) { reportError(error); }
finally { if (pool) await pool.end(); if (connector) connector.close(); }
