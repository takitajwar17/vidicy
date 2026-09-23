export function exportToCSV(data: any[], filename: string) {
  if (data.length === 0) return

  const headers = Object.keys(data[0]).join(",")
  const rows = data.map((row) => 
    Object.values(row)
      .map((value) => {
        if (value instanceof Date) return value.toISOString()
        if (typeof value === "string") return `"${value.replace(/"/g, '""')}"`
        return value
      })
      .join(",")
  )

  const csvContent = [headers, ...rows].join("\n")
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.setAttribute("href", url)
  link.setAttribute("download", `${filename}.csv`)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}