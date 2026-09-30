#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appDir = resolve(__dirname, "..");
const repoRoot = resolve(appDir, "../..");
const d1Dir = join(appDir, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
const r2MetadataDir = join(appDir, ".wrangler/state/v3/r2/miniflare-R2BucketObject");
const r2BucketBlobDir = join(appDir, ".wrangler/state/v3/r2/vidicy-agency-documents/blobs");
const pdfOutDir = join(appDir, "output/pdf/seed-agency-applications");
const imageOutDir = join(appDir, "output/imagegen/seed-agency-applications");
const ownerEmail = "tajwaruzzaman@iut-dhaka.edu";
const now = Math.floor(Date.now() / 1000);
const shouldUploadR2 = process.env.SEED_UPLOAD_R2 !== "0";

function daysAgo(days) {
  return now - days * 24 * 60 * 60;
}

function daysFromNow(days) {
  return now + days * 24 * 60 * 60;
}

function json(value) {
  return JSON.stringify(value);
}

function findLocalD1Database() {
  if (!existsSync(d1Dir)) {
    throw new Error(`Local D1 directory not found: ${d1Dir}`);
  }

  const sqliteFiles = readdirSync(d1Dir)
    .filter((file) => file.endsWith(".sqlite"))
    .map((file) => join(d1Dir, file))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

  if (sqliteFiles.length === 0) {
    throw new Error(`No local D1 sqlite database found in ${d1Dir}`);
  }

  return sqliteFiles[0];
}

function findLocalR2MetadataDatabase() {
  if (!existsSync(r2MetadataDir)) {
    return null;
  }

  const sqliteFiles = readdirSync(r2MetadataDir)
    .filter((file) => file.endsWith(".sqlite"))
    .map((file) => join(r2MetadataDir, file))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

  return sqliteFiles[0] ?? null;
}

function ensureDirs() {
  mkdirSync(pdfOutDir, { recursive: true });
  mkdirSync(imageOutDir, { recursive: true });
}

function escapePdfText(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapWords(text, maxChars = 92) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }

  if (line) {
    lines.push(line);
  }

  return lines;
}

function pdfText(font, size, x, y, text) {
  return `BT /${font} ${size} Tf ${x} ${y} Td (${escapePdfText(text)}) Tj ET`;
}

function createPdf({ filePath, title, subtitle, sections }) {
  const commands = [];
  let y = 794;

  commands.push(pdfText("F2", 20, 54, y, title));
  y -= 24;
  if (subtitle) {
    commands.push(pdfText("F1", 10, 54, y, subtitle));
    y -= 28;
  }

  for (const section of sections) {
    if (section.heading) {
      commands.push(pdfText("F2", 12, 54, y, section.heading.toUpperCase()));
      y -= 18;
    }

    for (const line of section.lines) {
      for (const wrapped of wrapWords(line, 94)) {
        commands.push(pdfText("F1", 10, 72, y, wrapped));
        y -= 14;
      }
    }

    y -= 8;
  }

  commands.push(pdfText("F1", 8, 54, 38, "Synthetic demo document for Vidicy local testing. Not an official document."));

  const stream = commands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  writeFileSync(filePath, pdf, "utf8");
}

const font = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "#": ["01010", "11111", "01010", "01010", "11111", "01010", "00000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "@": ["01110", "10001", "10111", "10101", "10111", "10000", "01110"],
  "_": ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
};

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

function createCanvas(width, height, background = "#ffffff") {
  const data = new Uint8Array(width * height * 3);
  const bg = hexToRgb(background);
  for (let offset = 0; offset < data.length; offset += 3) {
    data[offset] = bg[0];
    data[offset + 1] = bg[1];
    data[offset + 2] = bg[2];
  }

  function setPixel(x, y, color) {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const rgb = Array.isArray(color) ? color : hexToRgb(color);
    const offset = (Math.floor(y) * width + Math.floor(x)) * 3;
    data[offset] = rgb[0];
    data[offset + 1] = rgb[1];
    data[offset + 2] = rgb[2];
  }

  function rect(x, y, w, h, color) {
    const rgb = Array.isArray(color) ? color : hexToRgb(color);
    for (let yy = Math.max(0, y); yy < Math.min(height, y + h); yy += 1) {
      for (let xx = Math.max(0, x); xx < Math.min(width, x + w); xx += 1) {
        setPixel(xx, yy, rgb);
      }
    }
  }

  function outline(x, y, w, h, color, thickness = 2) {
    rect(x, y, w, thickness, color);
    rect(x, y + h - thickness, w, thickness, color);
    rect(x, y, thickness, h, color);
    rect(x + w - thickness, y, thickness, h, color);
  }

  function circle(cx, cy, radius, color) {
    const rgb = Array.isArray(color) ? color : hexToRgb(color);
    for (let y = cy - radius; y <= cy + radius; y += 1) {
      for (let x = cx - radius; x <= cx + radius; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= radius * radius) {
          setPixel(x, y, rgb);
        }
      }
    }
  }

  function line(x1, y1, x2, y2, color, thickness = 1) {
    const dx = Math.abs(x2 - x1);
    const sx = x1 < x2 ? 1 : -1;
    const dy = -Math.abs(y2 - y1);
    const sy = y1 < y2 ? 1 : -1;
    let error = dx + dy;
    let x = x1;
    let y = y1;

    while (true) {
      rect(x - Math.floor(thickness / 2), y - Math.floor(thickness / 2), thickness, thickness, color);
      if (x === x2 && y === y2) break;
      const doubled = 2 * error;
      if (doubled >= dy) {
        error += dy;
        x += sx;
      }
      if (doubled <= dx) {
        error += dx;
        y += sy;
      }
    }
  }

  function text(x, y, value, color = "#111827", scale = 3) {
    const upper = String(value).toUpperCase();
    let cursor = x;
    for (const char of upper) {
      const glyph = font[char] ?? font[" "];
      for (let row = 0; row < glyph.length; row += 1) {
        for (let col = 0; col < glyph[row].length; col += 1) {
          if (glyph[row][col] === "1") {
            rect(cursor + col * scale, y + row * scale, scale, scale, color);
          }
        }
      }
      cursor += 6 * scale;
    }
  }

  return { data, width, height, rect, outline, circle, line, text };
}

function writeRasterFromCanvas(canvas, filePath, format) {
  const ppmPath = `${filePath}.ppm`;
  const header = Buffer.from(`P6\n${canvas.width} ${canvas.height}\n255\n`, "ascii");
  writeFileSync(ppmPath, Buffer.concat([header, Buffer.from(canvas.data)]));
  execFileSync("sips", ["-s", "format", format, ppmPath, "--out", filePath], { stdio: "pipe" });
  rmSync(ppmPath, { force: true });
}

function createPassportImage({ filePath, applicant, nationality, passportNumber, dateOfBirth, format }) {
  const canvas = createCanvas(1200, 760, "#eef7f6");
  canvas.rect(0, 0, 1200, 760, "#eef7f6");
  canvas.rect(0, 0, 1200, 84, "#25302e");
  canvas.text(42, 28, "SAMPLE PASSPORT MOCK", "#ffffff", 4);
  canvas.text(820, 34, "NOT REAL", "#f2b8b5", 4);
  canvas.outline(32, 118, 1136, 572, "#55716c", 4);
  canvas.rect(58, 148, 310, 392, "#dbe7e5");
  canvas.outline(58, 148, 310, 392, "#6b8580", 3);
  canvas.circle(213, 280, 74, "#9fb6b1");
  canvas.rect(133, 360, 160, 128, "#8fa8a2");
  canvas.text(92, 582, "SYNTHETIC DEMO IMAGE", "#b91c1c", 4);
  canvas.text(420, 156, `NAME: ${applicant}`, "#111827", 4);
  canvas.text(420, 220, `NATIONALITY: ${nationality}`, "#111827", 4);
  canvas.text(420, 284, `PASSPORT: ${passportNumber}`, "#111827", 4);
  canvas.text(420, 348, `DATE OF BIRTH: ${dateOfBirth}`, "#111827", 4);
  canvas.text(420, 412, "ISSUED: 2023-01-16", "#111827", 4);
  canvas.text(420, 476, "EXPIRES: 2033-01-15", "#111827", 4);
  canvas.text(420, 548, "TYPE: VISITOR FILE SUPPORT", "#111827", 3);
  canvas.line(420, 610, 1090, 610, "#55716c", 3);
  canvas.text(420, 632, `P<SAMPLE<<${applicant.replace(/[^A-Z ]/gi, "").replaceAll(" ", "<")}`, "#111827", 3);
  canvas.text(420, 676, `${passportNumber}<SYNTHETIC<DEMO<DOCUMENT`, "#111827", 3);

  writeRasterFromCanvas(canvas, filePath, format);
}

function createNationalIdImage({ filePath, applicant, nationality, passportNumber, dateOfBirth, format }) {
  const canvas = createCanvas(1000, 630, "#f8fafc");
  canvas.rect(0, 0, 1000, 90, "#25302e");
  canvas.text(36, 32, "SAMPLE NATIONAL ID MOCK", "#ffffff", 4);
  canvas.text(760, 34, "NOT REAL", "#f2b8b5", 4);
  canvas.outline(30, 120, 940, 440, "#cbd5e1", 4);
  canvas.rect(60, 158, 230, 270, "#e2e8f0");
  canvas.circle(175, 245, 54, "#94a3b8");
  canvas.rect(108, 320, 134, 84, "#94a3b8");
  canvas.text(330, 162, `NAME: ${applicant}`, "#0f172a", 4);
  canvas.text(330, 226, `COUNTRY: ${nationality}`, "#0f172a", 4);
  canvas.text(330, 290, `REFERENCE: ${passportNumber}`, "#0f172a", 4);
  canvas.text(330, 354, `DOB: ${dateOfBirth}`, "#0f172a", 4);
  canvas.text(330, 448, "SYNTHETIC DEMO IMAGE ONLY", "#b91c1c", 4);

  writeRasterFromCanvas(canvas, filePath, format);
}

function createPhotoImage({ filePath, applicant, format }) {
  const canvas = createCanvas(720, 920, "#ffffff");
  canvas.rect(0, 0, 720, 920, "#f8fafc");
  canvas.outline(32, 32, 656, 856, "#cbd5e1", 5);
  canvas.circle(360, 340, 116, "#a7b7b4");
  canvas.rect(220, 492, 280, 210, "#879c97");
  canvas.text(132, 780, "SAMPLE PASSPORT PHOTO", "#25302e", 4);
  canvas.text(176, 830, applicant, "#25302e", 3);
  writeRasterFromCanvas(canvas, filePath, format);
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getFileMeta(filePath) {
  return {
    size: statSync(filePath).size,
    bytes: readFileSync(filePath),
  };
}

const reviewers = [
  { id: "usr_seed_reviewer_olivia_chen", firstName: "Olivia", lastName: "Chen", email: "olivia.chen+seed@vidicy.test", role: "admin" },
  { id: "usr_seed_reviewer_arjun_patel", firstName: "Arjun", lastName: "Patel", email: "arjun.patel+seed@vidicy.test", role: "member" },
  { id: "usr_seed_reviewer_maya_singh", firstName: "Maya", lastName: "Singh", email: "maya.singh+seed@vidicy.test", role: "member" },
];

const cases = [
  {
    number: "SEED-2026-0001",
    name: "Sofia Reyes - France Schengen Tourist",
    client: { id: "acl_seed_global_gateway", name: "Global Gateway Travels", email: "ops+global-gateway@vidicy.test", phone: "+63 917 555 0101", companyName: "Global Gateway Travels", country: "Philippines" },
    applicant: { name: "Sofia Reyes", email: "sofia.reyes@example.test", nationality: "Philippines", dob: "1994-02-18", passport: "PHD2849106", approvedBefore: 1, approvedVisaType: "Japan Tourist", approvedYear: "2023", rejectedBefore: 0 },
    route: { home: "Philippines", current: "Philippines", destination: "France", visaType: "Schengen Tourist", embassy: "Embassy of France in Manila" },
    status: "in_progress",
    agencyStatus: "in_review",
    priority: "urgent",
    source: "agency_portal",
    reviewer: "usr_seed_reviewer_olivia_chen",
    submittedOffset: 5,
    dueOffset: 2,
    serviceLevel: "48 hour review",
  },
  {
    number: "SEED-2026-0002",
    name: "Rahul Mehta - United States B1/B2",
    client: { id: "acl_seed_maple_visas", name: "Maple Visa Desk", email: "intake+maple@vidicy.test", phone: "+91 80 5550 1122", companyName: "Maple Visa Desk", country: "India" },
    applicant: { name: "Rahul Mehta", email: "rahul.mehta@example.test", nationality: "India", dob: "1989-11-03", passport: "IND7382519", approvedBefore: 1, approvedVisaType: "Schengen Tourist", approvedYear: "2022", rejectedBefore: 0 },
    route: { home: "India", current: "India", destination: "United States", visaType: "B1/B2 Visitor", embassy: "U.S. Embassy New Delhi" },
    status: "in_progress",
    agencyStatus: "in_review",
    priority: "high",
    source: "walk_in",
    reviewer: "usr_seed_reviewer_arjun_patel",
    submittedOffset: 3,
    dueOffset: 4,
    serviceLevel: "standard review",
  },
  {
    number: "SEED-2026-0003",
    name: "Amina Chowdhury - Canada Visitor",
    client: { id: "acl_seed_northstar", name: "Northstar Travel Bureau", email: "cases+northstar@vidicy.test", phone: "+880 17 5555 2101", companyName: "Northstar Travel Bureau", country: "Bangladesh" },
    applicant: { name: "Amina Chowdhury", email: "amina.chowdhury@example.test", nationality: "Bangladesh", dob: "1997-07-22", passport: "BGD4917350", approvedBefore: 0, rejectedBefore: 1, rejectedVisaType: "Canada Visitor", rejectedYear: "2021", rejectedReason: "Weak travel history and limited proof of funds." },
    route: { home: "Bangladesh", current: "Bangladesh", destination: "Canada", visaType: "Visitor Visa", embassy: "High Commission of Canada in Singapore" },
    status: "in_progress",
    agencyStatus: "needs_client",
    priority: "normal",
    source: "email",
    reviewer: "usr_seed_reviewer_maya_singh",
    submittedOffset: 7,
    dueOffset: 1,
    serviceLevel: "evidence follow-up",
  },
  {
    number: "SEED-2026-0004",
    name: "Minh Nguyen - UK Student",
    client: { id: "acl_seed_summit", name: "Summit Study Abroad", email: "ukdesk+summit@vidicy.test", phone: "+84 28 5555 1144", companyName: "Summit Study Abroad", country: "Vietnam" },
    applicant: { name: "Minh Nguyen", email: "minh.nguyen@example.test", nationality: "Vietnam", dob: "2002-05-14", passport: "VNM6047128", approvedBefore: 1, approvedVisaType: "Singapore Visit", approvedYear: "2024", rejectedBefore: 0 },
    route: { home: "Vietnam", current: "Vietnam", destination: "United Kingdom", visaType: "Student Visa", embassy: "UK Visa Application Centre Ho Chi Minh City" },
    status: "in_progress",
    agencyStatus: "in_review",
    priority: "high",
    source: "partner_referral",
    reviewer: "usr_seed_reviewer_olivia_chen",
    submittedOffset: 2,
    dueOffset: 5,
    serviceLevel: "student desk",
  },
  {
    number: "SEED-2026-0005",
    name: "Nadia Rahman - Australia Tourist",
    client: { id: "acl_seed_dreamroute", name: "DreamRoute Holidays", email: "review+dreamroute@vidicy.test", phone: "+880 18 5555 0188", companyName: "DreamRoute Holidays", country: "Bangladesh" },
    applicant: { name: "Nadia Rahman", email: "nadia.rahman@example.test", nationality: "Bangladesh", dob: "1991-09-30", passport: "BGD2388045", approvedBefore: 1, approvedVisaType: "Thailand Tourist", approvedYear: "2023", rejectedBefore: 0 },
    route: { home: "Bangladesh", current: "Bangladesh", destination: "Australia", visaType: "Visitor Visa subclass 600", embassy: "Australian Visa Application Centre Dhaka" },
    status: "ready",
    agencyStatus: "ready_to_submit",
    priority: "normal",
    source: "manual",
    reviewer: "usr_q1oq2aj8a5yjhne8ws3upu5r",
    submittedOffset: 10,
    dueOffset: -1,
    reviewCompletedOffset: 1,
    serviceLevel: "final check",
  },
  {
    number: "SEED-2026-0006",
    name: "Chen Wei - Japan Tourist",
    client: { id: "acl_seed_orbit", name: "Orbit Visa Services", email: "japan+orbit@vidicy.test", phone: "+86 21 5555 8831", companyName: "Orbit Visa Services", country: "China" },
    applicant: { name: "Chen Wei", email: "chen.wei@example.test", nationality: "China", dob: "1985-01-08", passport: "CHN9621840", approvedBefore: 1, approvedVisaType: "Korea Tourist", approvedYear: "2024", rejectedBefore: 0 },
    route: { home: "China", current: "China", destination: "Japan", visaType: "Temporary Visitor", embassy: "Embassy of Japan in Beijing" },
    status: "submitted",
    agencyStatus: "ready_to_submit",
    priority: "low",
    source: "agency_portal",
    reviewer: "usr_seed_reviewer_arjun_patel",
    submittedOffset: 14,
    dueOffset: -3,
    reviewCompletedOffset: 4,
    finalSubmissionOffset: 2,
    serviceLevel: "bulk tour group",
  },
  {
    number: "SEED-2026-0007",
    name: "Dewi Santoso - New Zealand Visitor",
    client: { id: "acl_seed_bluepine", name: "Bluepine Travel", email: "nzdesk+bluepine@vidicy.test", phone: "+62 21 5555 7766", companyName: "Bluepine Travel", country: "Indonesia" },
    applicant: { name: "Dewi Santoso", email: "dewi.santoso@example.test", nationality: "Indonesia", dob: "1998-12-11", passport: "IDN5074912", approvedBefore: 0, rejectedBefore: 0 },
    route: { home: "Indonesia", current: "Indonesia", destination: "New Zealand", visaType: "Visitor Visa", embassy: "New Zealand Visa Application Centre Jakarta" },
    status: "ready",
    agencyStatus: "in_review",
    priority: "normal",
    source: "email",
    reviewer: "usr_seed_reviewer_maya_singh",
    submittedOffset: 1,
    dueOffset: 6,
    serviceLevel: "family visit desk",
  },
  {
    number: "SEED-2026-0008",
    name: "Aigerim Saken - UAE Tourist",
    client: { id: "acl_seed_silkroad", name: "SilkRoad Visa House", email: "dubai+silkroad@vidicy.test", phone: "+7 727 555 4422", companyName: "SilkRoad Visa House", country: "Kazakhstan" },
    applicant: { name: "Aigerim Saken", email: "aigerim.saken@example.test", nationality: "Kazakhstan", dob: "1993-04-19", passport: "KAZ3847205", approvedBefore: 1, approvedVisaType: "Turkey Tourist", approvedYear: "2022", rejectedBefore: 0 },
    route: { home: "Kazakhstan", current: "Kazakhstan", destination: "United Arab Emirates", visaType: "Tourist Visa", embassy: "UAE Visa Processing Centre Almaty" },
    status: "draft",
    agencyStatus: "intake",
    priority: "normal",
    source: "call_center",
    reviewer: "usr_q1oq2aj8a5yjhne8ws3upu5r",
    submittedOffset: 0,
    dueOffset: 8,
    serviceLevel: "intake queue",
  },
  {
    number: "SEED-2026-0009",
    name: "Farhan Ali - Germany Business",
    client: { id: "acl_seed_meridian", name: "Meridian Corporate Travel", email: "business+meridian@vidicy.test", phone: "+92 21 5555 3319", companyName: "Meridian Corporate Travel", country: "Pakistan" },
    applicant: { name: "Farhan Ali", email: "farhan.ali@example.test", nationality: "Pakistan", dob: "1987-10-27", passport: "PAK8204916", approvedBefore: 1, approvedVisaType: "UAE Business", approvedYear: "2024", rejectedBefore: 1, rejectedVisaType: "Schengen Business", rejectedYear: "2020", rejectedReason: "Invitation letter did not explain business purpose clearly." },
    route: { home: "Pakistan", current: "Pakistan", destination: "Germany", visaType: "Schengen Business", embassy: "German Consulate General Karachi" },
    status: "in_progress",
    agencyStatus: "in_review",
    priority: "urgent",
    source: "enterprise_client",
    reviewer: "usr_seed_reviewer_olivia_chen",
    submittedOffset: 4,
    dueOffset: 1,
    serviceLevel: "corporate rush",
  },
  {
    number: "SEED-2026-0010",
    name: "Mai Tran - Singapore Business",
    client: { id: "acl_seed_novatrail", name: "NovaTrail Corporate Desk", email: "singapore+novatrail@vidicy.test", phone: "+84 24 5555 9910", companyName: "NovaTrail Corporate Desk", country: "Vietnam" },
    applicant: { name: "Mai Tran", email: "mai.tran@example.test", nationality: "Vietnam", dob: "1990-06-06", passport: "VNM9182744", approvedBefore: 1, approvedVisaType: "Malaysia Business", approvedYear: "2023", rejectedBefore: 0 },
    route: { home: "Vietnam", current: "Vietnam", destination: "Singapore", visaType: "Business Visit", embassy: "Singapore Consulate Ho Chi Minh City" },
    status: "in_progress",
    agencyStatus: "in_review",
    priority: "high",
    source: "manual",
    reviewer: "usr_seed_reviewer_arjun_patel",
    submittedOffset: 6,
    dueOffset: 3,
    serviceLevel: "business desk",
  },
];

function checklistFor(caseData, applicantId) {
  return [
    {
      id: `citem_${slug(caseData.number)}_passport`,
      applicantId,
      name: "Passport bio page",
      description: "Clear passport identity page with expiry date visible.",
      mistakes: "Expired passport, cropped MRZ, glare over passport number.",
      required: 1,
      status: "uploaded",
    },
    {
      id: `citem_${slug(caseData.number)}_form`,
      applicantId,
      name: `${caseData.route.visaType} application form`,
      description: "Completed route-specific application form for the applicant.",
      mistakes: "Unanswered travel history fields, mismatched dates, unsigned declarations.",
      required: 1,
      status: "uploaded",
    },
    {
      id: `citem_${slug(caseData.number)}_bank`,
      applicantId,
      name: "Recent bank statements",
      description: "Three to six months of account statements showing income and balances.",
      mistakes: "Missing account holder name, unexplained deposits, partial statement periods.",
      required: 1,
      status: "uploaded",
    },
    {
      id: `citem_${slug(caseData.number)}_employment`,
      applicantId,
      name: "Employment or enrollment evidence",
      description: "Letter confirming job, study, leave, salary, or enrollment status.",
      mistakes: "No letterhead, missing contact details, dates inconsistent with travel plan.",
      required: 1,
      status: "uploaded",
    },
    {
      id: `citem_${slug(caseData.number)}_itinerary`,
      applicantId,
      name: "Travel itinerary",
      description: "Flight plan, trip dates, and planned route for the visit.",
      mistakes: "Dates do not match hotel booking or application form.",
      required: 1,
      status: "uploaded",
    },
    {
      id: `citem_${slug(caseData.number)}_accommodation`,
      applicantId,
      name: "Accommodation booking",
      description: "Hotel booking or host details covering the declared stay.",
      mistakes: "Booking does not cover full trip, guest name missing.",
      required: 1,
      status: "uploaded",
    },
    {
      id: `citem_${slug(caseData.number)}_cover`,
      applicantId,
      name: "Purpose of travel letter",
      description: "Short statement explaining purpose, dates, funding, and return plan.",
      mistakes: "Generic letter, no return ties, purpose conflicts with selected visa type.",
      required: 1,
      status: "uploaded",
    },
    {
      id: `citem_${slug(caseData.number)}_national_id`,
      applicantId,
      name: "National ID or residence proof",
      description: "Government or residence document used for identity and current address checks.",
      mistakes: "Document is expired, unclear, or address does not match application.",
      required: 0,
      status: "uploaded",
    },
    {
      id: `citem_${slug(caseData.number)}_previous_visas`,
      applicantId,
      name: "Previous visas",
      description: "Copies of relevant past visas or entry stamps if available.",
      mistakes: "Only refusal letter uploaded, missing approval stickers or entry stamps.",
      required: 0,
      status: caseData.applicant.approvedBefore ? "uploaded" : "pending",
    },
  ];
}

function createDocumentFiles(caseData, appId, applicantId) {
  const applicant = caseData.applicant;
  const base = slug(caseData.number);
  const docs = [];

  function addPdf({ key, checklistId, fileName, title, subtitle, sections }) {
    const filePath = join(pdfOutDir, `${base}-${key}.pdf`);
    createPdf({ filePath, title, subtitle, sections });
    const text = [title, subtitle, ...sections.flatMap((section) => [section.heading, ...section.lines])].filter(Boolean).join("\n");
    docs.push({
      id: `udoc_${base}_${key}`,
      applicationId: appId,
      applicantId,
      checklistItemId: checklistId,
      fileName,
      filePath,
      mimeType: "application/pdf",
      pageCount: 1,
      textContent: text,
      imageDescription: null,
      extractionPayload: { synthetic: true, generator: "seed-agency-demo-data", type: key },
    });
  }

  function addImage({ key, checklistId, fileName, creator, mimeType, format, description, textContent }) {
    const extension = mimeType === "image/png" ? "png" : "jpg";
    const filePath = join(imageOutDir, `${base}-${key}.${extension}`);
    creator({ filePath, applicant: applicant.name, nationality: applicant.nationality, passportNumber: applicant.passport, dateOfBirth: applicant.dob, format });
    docs.push({
      id: `udoc_${base}_${key}`,
      applicationId: appId,
      applicantId,
      checklistItemId: checklistId,
      fileName,
      filePath,
      mimeType,
      pageCount: 1,
      textContent,
      imageDescription: description,
      extractionPayload: { synthetic: true, generator: "seed-agency-demo-data", type: key },
    });
  }

  const checklistId = (suffix) => `citem_${base}_${suffix}`;
  const travelStart = "2026-10-06";
  const travelEnd = "2026-10-18";

  addImage({
    key: "passport",
    checklistId: checklistId("passport"),
    fileName: `${applicant.name} Passport Bio Page.jpg`,
    creator: createPassportImage,
    mimeType: "image/jpeg",
    format: "jpeg",
    description: `Clearly synthetic passport-style mock image for ${applicant.name}. Contains watermark text and fake passport number ${applicant.passport}.`,
    textContent: `Synthetic passport mock. Name: ${applicant.name}. Nationality: ${applicant.nationality}. Passport number: ${applicant.passport}. Date of birth: ${applicant.dob}. Not a real passport.`,
  });

  addPdf({
    key: "application-form",
    checklistId: checklistId("form"),
    fileName: `${applicant.name} ${caseData.route.visaType} Application Form.pdf`,
    title: `${caseData.route.visaType} Application Form`,
    subtitle: `${caseData.number} / ${applicant.name}`,
    sections: [
      { heading: "Applicant", lines: [`Full name: ${applicant.name}`, `Nationality: ${applicant.nationality}`, `Passport number: ${applicant.passport}`, `Date of birth: ${applicant.dob}`] },
      { heading: "Travel Route", lines: [`Destination: ${caseData.route.destination}`, `Embassy or processing post: ${caseData.route.embassy}`, `Intended travel dates: ${travelStart} to ${travelEnd}`] },
      { heading: "Agency Intake", lines: [`Client: ${caseData.client.name}`, `Intake source: ${caseData.source}`, `Service level: ${caseData.serviceLevel}`] },
    ],
  });

  addPdf({
    key: "bank-statement",
    checklistId: checklistId("bank"),
    fileName: `${applicant.name} Bank Statement.pdf`,
    title: "Bank Statement Summary",
    subtitle: `${caseData.number} / synthetic account record`,
    sections: [
      { heading: "Account Holder", lines: [`Name: ${applicant.name}`, `Statement period: 2026-07-01 to 2026-09-30`, `Account reference: DEMO-${applicant.passport.slice(-4)}`] },
      { heading: "Balances", lines: ["Opening balance: USD 8,420", "Average balance: USD 11,940", "Closing balance: USD 13,280", "Salary credits received monthly from listed employer."] },
      { heading: "Agency Notes", lines: ["This file is a made-up bank statement for local testing. It is not financial evidence."] },
    ],
  });

  addPdf({
    key: "employment-letter",
    checklistId: checklistId("employment"),
    fileName: `${applicant.name} Employment Letter.pdf`,
    title: "Employment Confirmation Letter",
    subtitle: `${caseData.number} / synthetic employer letter`,
    sections: [
      { heading: "Employer", lines: [`Employee: ${applicant.name}`, "Role: Operations Manager", "Monthly salary: USD 2,750", "Employment start date: 2021-08-16"] },
      { heading: "Leave Approval", lines: [`Approved leave dates: ${travelStart} to ${travelEnd}`, "The employee is expected to resume work after the trip.", "Contact: hr@example-employer.test"] },
    ],
  });

  addPdf({
    key: "itinerary",
    checklistId: checklistId("itinerary"),
    fileName: `${applicant.name} Travel Itinerary.pdf`,
    title: "Travel Itinerary",
    subtitle: `${caseData.number} / ${caseData.route.destination}`,
    sections: [
      { heading: "Trip", lines: [`Applicant: ${applicant.name}`, `Destination: ${caseData.route.destination}`, `Outbound: ${travelStart}`, `Return: ${travelEnd}`] },
      { heading: "Flights", lines: ["Outbound flight: Demo Air DA-214, morning departure.", "Return flight: Demo Air DA-215, evening departure.", "Booking status: reserved for application review only."] },
    ],
  });

  addPdf({
    key: "hotel-booking",
    checklistId: checklistId("accommodation"),
    fileName: `${applicant.name} Accommodation Booking.pdf`,
    title: "Accommodation Booking",
    subtitle: `${caseData.number} / synthetic hotel record`,
    sections: [
      { heading: "Booking", lines: [`Guest: ${applicant.name}`, `Stay dates: ${travelStart} to ${travelEnd}`, `City: ${caseData.route.destination}`, "Hotel: Sample Central Hotel"] },
      { heading: "Payment", lines: ["Reservation type: refundable", "Booking reference: HTL-DEMO-4821", "This is a made-up hotel booking for demo seeding."] },
    ],
  });

  addPdf({
    key: "cover-letter",
    checklistId: checklistId("cover"),
    fileName: `${applicant.name} Purpose of Travel Letter.pdf`,
    title: "Purpose of Travel Letter",
    subtitle: `${caseData.number} / client draft`,
    sections: [
      { heading: "Purpose", lines: [`I, ${applicant.name}, plan to visit ${caseData.route.destination} for a short ${caseData.route.visaType.toLowerCase()} trip.`, `The planned stay is from ${travelStart} to ${travelEnd}.`] },
      { heading: "Funding and Return", lines: ["I will fund the visit using personal savings and salary income.", `I intend to return to ${caseData.route.home} after the visit to continue work and family commitments.`] },
    ],
  });

  addImage({
    key: "national-id",
    checklistId: checklistId("national_id"),
    fileName: `${applicant.name} National ID Mock.png`,
    creator: createNationalIdImage,
    mimeType: "image/png",
    format: "png",
    description: `Clearly synthetic national ID-style mock image for ${applicant.name}. Not a real identity document.`,
    textContent: `Synthetic national ID mock. Name: ${applicant.name}. Country: ${applicant.nationality}. Reference: ${applicant.passport}. Date of birth: ${applicant.dob}. Not a real identity document.`,
  });

  addImage({
    key: "photo",
    checklistId: null,
    fileName: `${applicant.name} Passport Photo Mock.jpg`,
    creator: createPhotoImage,
    mimeType: "image/jpeg",
    format: "jpeg",
    description: `Synthetic passport photo placeholder for ${applicant.name}.`,
    textContent: `Synthetic passport photo placeholder for ${applicant.name}. Not a real biometric photograph.`,
  });

  if (applicant.approvedBefore) {
    addPdf({
      key: "previous-visas",
      checklistId: checklistId("previous_visas"),
      fileName: `${applicant.name} Previous Visa Copies.pdf`,
      title: "Previous Visa Copies Summary",
      subtitle: `${caseData.number} / synthetic travel history`,
      sections: [
        { heading: "Previous Approval", lines: [`Visa type: ${applicant.approvedVisaType}`, `Approval year: ${applicant.approvedYear}`, "Entries used within the permitted travel dates."] },
        { heading: "Agency Note", lines: ["Synthetic previous visa summary created for local demo data."] },
      ],
    });
  }

  return docs;
}

function insertUser(db, user) {
  db.prepare(`
    INSERT INTO user (createdAt, updatedAt, updateCounter, id, firstName, lastName, email, passwordHash, role, emailVerified, signUpIpAddress, googleAccountId, avatar)
    VALUES (?, ?, 0, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, NULL)
    ON CONFLICT(email) DO UPDATE SET
      firstName = excluded.firstName,
      lastName = excluded.lastName,
      role = excluded.role,
      emailVerified = coalesce(user.emailVerified, excluded.emailVerified),
      updatedAt = excluded.updatedAt
  `).run(now, now, user.id, user.firstName, user.lastName, user.email, user.appRole ?? "user", now);
}

function ensureTeamMember(db, { id, userId, email, role, invitedBy }) {
  db.prepare("UPDATE agency_team_member SET userId = ?, role = ?, status = 'active', invitedBy = ?, invitedAt = ?, joinedAt = ?, updatedAt = ? WHERE lower(email) = lower(?)")
    .run(userId, role, invitedBy, now, now, now, email);
  db.prepare(`
    INSERT OR IGNORE INTO agency_team_member (createdAt, updatedAt, updateCounter, id, userId, email, role, status, invitedBy, invitedAt, joinedAt)
    VALUES (?, ?, 0, ?, ?, ?, ?, 'active', ?, ?, ?)
  `).run(now, now, id, userId, email, role, invitedBy, now, now);
  db.prepare("UPDATE agency_team_member SET email = ?, role = ?, status = 'active', invitedBy = ?, invitedAt = ?, joinedAt = ?, updatedAt = ? WHERE userId = ?")
    .run(email, role, invitedBy, now, now, now, userId);
}

function uploadToLocalR2(docs, ownerId) {
  if (!shouldUploadR2) {
    return { uploaded: 0, failed: 0, skipped: docs.length };
  }

  const r2DbPath = findLocalR2MetadataDatabase();
  if (!r2DbPath) {
    return { uploaded: 0, failed: docs.length, skipped: 0 };
  }

  mkdirSync(r2BucketBlobDir, { recursive: true });

  const r2Db = new DatabaseSync(r2DbPath);
  r2Db.exec("PRAGMA busy_timeout = 20000");

  let uploaded = 0;
  let failed = 0;

  try {
    const prefix = `visa-documents/${ownerId}/vapp_seed-2026-`;
    const oldObjects = r2Db.prepare("SELECT blob_id FROM _mf_objects WHERE key LIKE ?").all(`${prefix}%`);
    r2Db.prepare("DELETE FROM _mf_objects WHERE key LIKE ?").run(`${prefix}%`);

    for (const object of oldObjects) {
      if (object.blob_id) {
        rmSync(join(r2BucketBlobDir, object.blob_id), { force: true });
      }
    }

    const insert = r2Db.prepare(`
      INSERT OR REPLACE INTO _mf_objects
        (key, blob_id, version, size, etag, uploaded, checksums, http_metadata, custom_metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const doc of docs) {
      try {
        const bytes = readFileSync(doc.filePath);
        const sha256 = createHash("sha256").update(bytes).digest("hex");
        const etag = createHash("md5").update(bytes).digest("hex");
        const blobId = `${sha256}${randomBytes(8).toString("hex")}`;
        const version = randomBytes(16).toString("hex");
        writeFileSync(join(r2BucketBlobDir, blobId), bytes);
        insert.run(
          doc.fileKey,
          blobId,
          version,
          bytes.length,
          etag,
          Date.now(),
          "{}",
          json({ contentType: doc.mimeType }),
          "{}",
        );
        uploaded += 1;
      } catch {
        failed += 1;
      }
    }
  } finally {
    r2Db.close();
  }

  return { uploaded, failed, skipped: 0 };
}

function seed() {
  ensureDirs();

  const dbPath = findLocalD1Database();
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA busy_timeout = 20000");
  db.exec("PRAGMA foreign_keys = ON");

  const owner = db.prepare("SELECT id, email, firstName, lastName FROM user WHERE lower(email) = lower(?)").get(ownerEmail);
  if (!owner) {
    throw new Error(`User not found: ${ownerEmail}. Sign in locally once before running this seed.`);
  }

  db.exec("BEGIN IMMEDIATE");

  try {
    for (const reviewer of reviewers) {
      insertUser(db, reviewer);
    }

    ensureTeamMember(db, {
      id: "atm_seed_owner_tajwaruzzaman",
      userId: owner.id,
      email: owner.email,
      role: "admin",
      invitedBy: owner.id,
    });

    for (const reviewer of reviewers) {
      ensureTeamMember(db, {
        id: `atm_${slug(reviewer.email)}`,
        userId: reviewer.id,
        email: reviewer.email,
        role: reviewer.role,
        invitedBy: owner.id,
      });
    }

    db.prepare("DELETE FROM visa_application WHERE userId = ? AND caseNumber LIKE 'SEED-2026-%'").run(owner.id);
    db.prepare("DELETE FROM agency_client WHERE notes LIKE 'Seeded demo agency client%'").run();

    const allDocs = [];

    for (let caseIndex = 0; caseIndex < cases.length; caseIndex += 1) {
      const caseData = cases[caseIndex];
      const appId = `vapp_${slug(caseData.number)}`;
      const applicantId = `appl_${slug(caseData.number)}_primary`;
      const createdAt = daysAgo(16 - caseIndex);
      const submittedAt = caseData.submittedOffset === 0 ? now : daysAgo(caseData.submittedOffset);
      const dueAt = caseData.dueOffset >= 0 ? daysFromNow(caseData.dueOffset) : daysAgo(Math.abs(caseData.dueOffset));
      const reviewCompletedAt = caseData.reviewCompletedOffset ? daysAgo(caseData.reviewCompletedOffset) : null;
      const finalSubmissionAt = caseData.finalSubmissionOffset ? daysAgo(caseData.finalSubmissionOffset) : null;
      const settings = {
        seeded: true,
        agencyWorkflow: true,
        serviceLevel: caseData.serviceLevel,
        internalNotes: `Demo agency case seeded for ${ownerEmail}.`,
        route: `${caseData.route.home} to ${caseData.route.destination}`,
        expectedReview: "Human reviewer should run AI review from inside the app.",
      };

      db.prepare(`
        INSERT INTO agency_client (createdAt, updatedAt, updateCounter, id, name, email, phone, companyName, country, notes)
        VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        createdAt,
        now,
        caseData.client.id,
        caseData.client.name,
        caseData.client.email,
        caseData.client.phone,
        caseData.client.companyName,
        caseData.client.country,
        `Seeded demo agency client for ${caseData.number}`,
      );

      db.prepare(`
        INSERT INTO visa_application (
          createdAt, updatedAt, updateCounter, id, userId, homeCountry, currentCountry, destinationCountry,
          visaType, embassy, status, riskLevel, readinessScore, trashedAt, name, settings, checklistSource,
          checklistGeneratedAt, checklistCitations, actualOutcome, outcomeDate, outcomeNotes, caseNumber,
          clientId, clientName, clientEmail, clientPhone, agencyStatus, priority, assignedReviewerId,
          intakeSource, submittedAt, dueAt, reviewCompletedAt, finalSubmissionAt, clientReportStatus
        )
        VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_started')
      `).run(
        createdAt,
        now,
        appId,
        owner.id,
        caseData.route.home,
        caseData.route.current,
        caseData.route.destination,
        caseData.route.visaType,
        caseData.route.embassy,
        caseData.status,
        caseData.name,
        json(settings),
        "manual_seed",
        now,
        json(["Synthetic checklist generated by local seed script"]),
        caseData.number,
        caseData.client.id,
        caseData.client.name,
        caseData.client.email,
        caseData.client.phone,
        caseData.agencyStatus,
        caseData.priority,
        caseData.reviewer,
        caseData.source,
        submittedAt,
        dueAt,
        reviewCompletedAt,
        finalSubmissionAt,
      );

      db.prepare(`
        INSERT INTO applicant (
          createdAt, updatedAt, updateCounter, id, applicationId, name, relationship, role, dateOfBirth,
          passportNumber, nationality, readinessScore, riskLevel, email, userId, approvedBefore,
          approvedVisaType, approvedYear, rejectedBefore, rejectedVisaType, rejectedYear, rejectedReason
        )
        VALUES (?, ?, 0, ?, ?, ?, 'primary', 'owner', ?, ?, ?, NULL, NULL, ?, NULL, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        createdAt,
        now,
        applicantId,
        appId,
        caseData.applicant.name,
        caseData.applicant.dob,
        caseData.applicant.passport,
        caseData.applicant.nationality,
        caseData.applicant.email,
        caseData.applicant.approvedBefore ?? 0,
        caseData.applicant.approvedVisaType ?? null,
        caseData.applicant.approvedYear ?? null,
        caseData.applicant.rejectedBefore ?? 0,
        caseData.applicant.rejectedVisaType ?? null,
        caseData.applicant.rejectedYear ?? null,
        caseData.applicant.rejectedReason ?? null,
      );

      const checklistItems = checklistFor(caseData, applicantId);
      for (let itemIndex = 0; itemIndex < checklistItems.length; itemIndex += 1) {
        const item = checklistItems[itemIndex];
        db.prepare(`
          INSERT INTO checklist_item (
            createdAt, updatedAt, updateCounter, id, applicationId, applicantId, documentName,
            description, commonMistakes, isRequired, status, sortOrder
          )
          VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          createdAt,
          now,
          item.id,
          appId,
          item.applicantId,
          item.name,
          item.description,
          item.mistakes,
          item.required,
          item.status,
          itemIndex + 1,
        );
      }

      const docs = createDocumentFiles(caseData, appId, applicantId);
      for (let docIndex = 0; docIndex < docs.length; docIndex += 1) {
        const doc = docs[docIndex];
        const meta = getFileMeta(doc.filePath);
        const safeName = doc.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const fileKey = `visa-documents/${owner.id}/${appId}/seed/${now + docIndex}-${safeName}`;
        doc.fileKey = fileKey;

        db.prepare(`
          INSERT INTO uploaded_document (
            id, applicationId, applicantId, checklistItemId, fileName, fileKey, fileSize, mimeType,
            uploadedAt, chunkCount, textContent, extractionStatus, indexingStatus, extractionMethod,
            extractedAt, indexingAttemptedAt, pageCount, imageDescription, extractionPayload
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'completed', 'skipped', 'seeded_text', ?, ?, ?, ?, ?)
        `).run(
          doc.id,
          appId,
          applicantId,
          doc.checklistItemId,
          doc.fileName,
          fileKey,
          meta.size,
          doc.mimeType,
          now,
          doc.textContent.slice(0, 50000),
          now,
          now,
          doc.pageCount,
          doc.imageDescription,
          json({ ...doc.extractionPayload, localPath: doc.filePath }),
        );

        allDocs.push(doc);
      }
    }

    db.exec("COMMIT");

    const r2 = uploadToLocalR2(allDocs, owner.id);

    const counts = {
      applications: db.prepare("SELECT count(*) AS count FROM visa_application WHERE userId = ? AND caseNumber LIKE 'SEED-2026-%'").get(owner.id).count,
      applicants: db.prepare("SELECT count(*) AS count FROM applicant WHERE applicationId IN (SELECT id FROM visa_application WHERE userId = ? AND caseNumber LIKE 'SEED-2026-%')").get(owner.id).count,
      checklistItems: db.prepare("SELECT count(*) AS count FROM checklist_item WHERE applicationId IN (SELECT id FROM visa_application WHERE userId = ? AND caseNumber LIKE 'SEED-2026-%')").get(owner.id).count,
      uploadedDocuments: db.prepare("SELECT count(*) AS count FROM uploaded_document WHERE applicationId IN (SELECT id FROM visa_application WHERE userId = ? AND caseNumber LIKE 'SEED-2026-%')").get(owner.id).count,
      documentEvaluations: db.prepare("SELECT count(*) AS count FROM document_evaluation WHERE applicationId IN (SELECT id FROM visa_application WHERE userId = ? AND caseNumber LIKE 'SEED-2026-%')").get(owner.id).count,
      reviewIssues: db.prepare("SELECT count(*) AS count FROM review_issue WHERE applicationId IN (SELECT id FROM visa_application WHERE userId = ? AND caseNumber LIKE 'SEED-2026-%')").get(owner.id).count,
      clientReports: db.prepare("SELECT count(*) AS count FROM client_report WHERE applicationId IN (SELECT id FROM visa_application WHERE userId = ? AND caseNumber LIKE 'SEED-2026-%')").get(owner.id).count,
      r2Uploaded: r2.uploaded,
      r2Failed: r2.failed,
      r2Skipped: r2.skipped,
    };

    console.log(JSON.stringify({ dbPath, ownerId: owner.id, pdfOutDir, imageOutDir, counts }, null, 2));
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
}

seed();
