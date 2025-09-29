import { RequestHandler, Router } from "express";
import * as XLSX from "xlsx";
import fs from "fs";
import { AttendanceResponse, AttendanceSummary, Employee, EmployeesResponse } from "@shared/api";
import { getFilePath } from "./files";

export const attendanceRouter = Router();

function normalizeStr(v: unknown): string {
  return String(v ?? "").trim();
}

function isIgnored(v: string): boolean {
  const s = String(v ?? "").trim();
  if (!s) return true;
  if (/^no\.?$/i.test(s)) return true; // header/identifier
  if (s === ".") return true; // ignore rows where cell is only a dot
  return false;
}

function toUpperNoSpaces(s: string) {
  return s.replace(/\s+/g, " ").trim().toUpperCase();
}

function normalizeForCompare(s: string) {
  return s.replace(/[.]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

function findPresentSheet(wb: XLSX.WorkBook): XLSX.WorkSheet | null {
  const sheetName = wb.SheetNames.find((n) => {
    const s = n.toLowerCase().trim();
    return s.includes("present") || s.includes("presant");
  });
  if (!sheetName) return null;
  return wb.Sheets[sheetName] ?? null;
}

function readEmployeesFromSheet(ws: XLSX.WorkSheet): Employee[] {
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  const employees: Employee[] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const cellB = ws[XLSX.utils.encode_cell({ r, c: 1 })]; // column B (1)
    const cellC = ws[XLSX.utils.encode_cell({ r, c: 2 })]; // column C (2)
    const number = normalizeStr(cellB?.v);
    const name = normalizeStr(cellC?.v);
    if (isIgnored(number) || isIgnored(name)) continue;
    employees.push({ number, name });
  }
  // Dedupe by employee number or name
  const map = new Map<string, Employee>();
  for (const e of employees) {
    const key = e.number || e.name;
    if (!map.has(key)) map.set(key, e);
  }
  return Array.from(map.values());
}

function classifyCell(raw: any) {
  const s = normalizeStr(raw).toUpperCase();
  if (!s) return { present: 0, absent: 0, weekoff: 0, ot: 0 } as const;
  let present = 0;
  let absent = 0;
  let weekoff = 0;
  let ot = 0;

  const otMatch = s.match(/OT\s*([0-9]+(?:\.[0-9]+)?)?/);
  if (otMatch) {
    const n = otMatch[1] ? parseFloat(otMatch[1]) : 0;
    if (!Number.isNaN(n)) ot += n;
  }

  if (s === "P" || s.startsWith("P/") || s === "PR" || s === "PRESENT") present = 1;
  else if (s === "A" || s === "ABSENT") absent = 1;
  else if (s === "WO" || s === "W/O" || s === "WEEKOFF" || s === "WEEK OFF") weekoff = 1;

  return { present, absent, weekoff, ot } as const;
}

function summarizeRow(ws: XLSX.WorkSheet, rowIndex: number): AttendanceSummary {
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  let present = 0;
  let absent = 0;
  let weekoff = 0;
  let otHours = 0;
  // daily values start from D (3) through AH (33) => 31 days
  const lastDayCol = Math.min(range.e.c, 33);
  for (let c = 3; c <= lastDayCol; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: rowIndex, c })];
    const cls = classifyCell(cell?.v);
    present += cls.present;
    absent += cls.absent;
    weekoff += cls.weekoff;
    otHours += cls.ot;
  }
  // Override with summary columns when present: AL (37) Weekoff, AP (41) OT
  const weekoffCell = ws[XLSX.utils.encode_cell({ r: rowIndex, c: 37 })];
  const otCell = ws[XLSX.utils.encode_cell({ r: rowIndex, c: 41 })];
  const parsedWO = Number.parseFloat(String(weekoffCell?.v ?? ""));
  if (!Number.isNaN(parsedWO)) weekoff = parsedWO;
  const parsedOT = Number.parseFloat(String(otCell?.v ?? ""));
  if (!Number.isNaN(parsedOT)) otHours = parsedOT;
  return { present, absent, weekoff, otHours };
}

attendanceRouter.get("/employees", ((req, res) => {
  const { file } = req.query as { file?: string };
  if (!file) return res.status(400).json({ error: "Missing file param" });
  const filePath = getFilePath(file);
  let wb: XLSX.WorkBook;
  try {
    const data = fs.readFileSync(filePath);
    wb = XLSX.read(data, { type: "buffer" });
  } catch (e: any) {
    if (e && e.code === "ENOENT") return res.status(404).json({ error: "File not found" });
    return res.status(400).json({ error: "Unable to read Excel file" });
  }
  const sheet = findPresentSheet(wb);
  if (!sheet) return res.status(400).json({ error: "Sheet 'present' not found" });
  const employees = readEmployeesFromSheet(sheet);
  const response: EmployeesResponse = { file, employees };
  res.json(response);
}) as RequestHandler);

attendanceRouter.get("/summary", ((req, res) => {
  const { file, number, name } = req.query as { file?: string; number?: string; name?: string };
  if (!file) return res.status(400).json({ error: "Missing file param" });
  if (!number && !name) return res.status(400).json({ error: "Provide number or name" });

  const filePath = getFilePath(file);
  let wb: XLSX.WorkBook;
  try {
    const data = fs.readFileSync(filePath);
    wb = XLSX.read(data, { type: "buffer" });
  } catch (e: any) {
    if (e && e.code === "ENOENT") return res.status(404).json({ error: "File not found" });
    return res.status(400).json({ error: "Unable to read Excel file" });
  }
  const sheet = findPresentSheet(wb);
  if (!sheet) return res.status(400).json({ error: "Sheet 'present' not found" });

  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  const normNumber = number ? normalizeForCompare(number) : undefined;
  const normName = name ? normalizeForCompare(name) : undefined;

  let foundRow = -1;
  let foundEmp: Employee | null = null;
  for (let r = range.s.r; r <= range.e.r; r++) {
    const cellB = sheet[XLSX.utils.encode_cell({ r, c: 1 })];
    const cellC = sheet[XLSX.utils.encode_cell({ r, c: 2 })];
    const b = normalizeStr(cellB?.v);
    const c = normalizeStr(cellC?.v);
    if (isIgnored(b) || isIgnored(c)) continue;

    const matchNumber = normNumber && normalizeForCompare(b) === normNumber;
    const matchName = normName && normalizeForCompare(c) === normName;

    if ((normNumber && matchNumber) || (normName && matchName)) {
      foundRow = r;
      foundEmp = { number: b, name: c };
      break;
    }
  }

  if (foundRow === -1 || !foundEmp) {
    return res.status(404).json({ error: "Employee not found" });
  }

  const summary = summarizeRow(sheet, foundRow);
  const response: AttendanceResponse = { file, employee: foundEmp, summary };
  res.json(response);
}) as RequestHandler);
