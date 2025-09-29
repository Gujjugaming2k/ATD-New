import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AttendanceResponse,
  EmployeesResponse,
  FilesListResponse,
  DailyAttendanceResponse,
} from "@shared/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export default function Index() {
  const filesQuery = useQuery({
    queryKey: ["files"],
    queryFn: async (): Promise<FilesListResponse> => {
      const res = await fetch("/api/files");
      if (!res.ok) throw new Error("Failed to fetch files");
      return res.json();
    },
  });

  const files = filesQuery.data?.files ?? [];
  const [file, setFile] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!file && files[0]) setFile(files[0].filename);
  }, [files, file]);

  const employeesQuery = useQuery({
    queryKey: ["employees", file],
    enabled: !!file,
    queryFn: async (): Promise<EmployeesResponse> => {
      const res = await fetch(
        `/api/attendance/employees?file=${encodeURIComponent(file!)}`,
      );
      if (!res.ok) throw new Error("Failed to fetch employees");
      return res.json();
    },
  });

  const [search, setSearch] = useState("");
  const [selectedNumber, setSelectedNumber] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const filteredEmployees = useMemo(() => {
    const list = employeesQuery.data?.employees ?? [];
    if (!search) return list.slice(0, 50);
    const q = search.toLowerCase();
    return list
      .filter(
        (e) =>
          e.number.toLowerCase().includes(q) ||
          e.name.toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [employeesQuery.data, search]);

  const summaryQuery = useQuery({
    queryKey: ["summary", file, selectedNumber, selectedName],
    enabled: !!file && (!!selectedNumber || !!selectedName),
    queryFn: async (): Promise<AttendanceResponse> => {
      const params = new URLSearchParams({ file: file! });
      if (selectedNumber) params.set("number", selectedNumber);
      if (selectedName) params.set("name", selectedName);
      const res = await fetch(`/api/attendance/summary?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch summary");
      return res.json();
    },
  });

  const dailyQuery = useQuery({
    queryKey: ["daily", file, selectedNumber, selectedName],
    enabled: !!file && (!!selectedNumber || !!selectedName),
    queryFn: async (): Promise<DailyAttendanceResponse> => {
      const params = new URLSearchParams({ file: file! });
      if (selectedNumber) params.set("number", selectedNumber);
      if (selectedName) params.set("name", selectedName);
      const res = await fetch(`/api/attendance/daily?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch daily attendance");
      return res.json();
    },
  });

  return (
    <div className="container mx-auto py-10 space-y-8">
      <section className="text-center space-y-2">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-cyan-500 bg-clip-text text-transparent">
          ATD Sonata
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Attendance report viewer. Select a file and search by Employee No or
          Name (from the "Present" sheet, columns B and C).
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Search Employee</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label className="mb-2 block text-sm font-medium">
                Monthly file
              </label>
              <Select value={file} onValueChange={setFile}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      files.length
                        ? "Select file"
                        : "No files found. Upload in Upload & Files"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {files.map((f) => (
                    <SelectItem key={f.filename} value={f.filename}>
                      {f.originalName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-2 block text-sm font-medium">
                Search by name or number
              </label>
              <Command className="rounded-md border">
                <CommandInput
                  placeholder="Type to search..."
                  value={search}
                  onValueChange={setSearch}
                />
                <CommandList>
                  <CommandEmpty>No results found.</CommandEmpty>
                  <CommandGroup heading="Employees">
                    {filteredEmployees.map((e) => (
                      <CommandItem
                        key={e.number + e.name}
                        onSelect={() => {
                          setSelectedNumber(e.number);
                          setSelectedName(e.name);
                        }}
                      >
                        <span className="font-medium">{e.name}</span>
                        <span className="ml-2 text-muted-foreground">
                          ({e.number})
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </div>
          </div>

          {summaryQuery.data && (
            <div className="grid gap-4 sm:grid-cols-7">
              <StatCard
                title="Present"
                value={summaryQuery.data.summary.present}
                color="bg-emerald-500"
              />
              <StatCard
                title="Absent"
                value={summaryQuery.data.summary.absent}
                color="bg-rose-500"
              />
              <StatCard
                title="Weekoff"
                value={summaryQuery.data.summary.weekoff}
                color="bg-amber-500"
              />
              <StatCard
                title="ATD"
                value={summaryQuery.data.summary.atd}
                color="bg-blue-500"
              />
              <StatCard
                title="OT Hours"
                value={summaryQuery.data.summary.otHours}
                color="bg-cyan-500"
              />
              <StatCard
                title="Minus"
                value={summaryQuery.data.summary.minus ?? 0}
                color="bg-fuchsia-500"
              />
              <StatCard
                title="Kitchen"
                value={summaryQuery.data.summary.kitchen ?? 0}
                color="bg-indigo-500"
              />
            </div>
          )}

          {summaryQuery.data?.details && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">
                    Mobile
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  <div>{summaryQuery.data.details.mobile1 || "-"}</div>
                  <div>{summaryQuery.data.details.mobile2 || ""}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">
                    Present Address
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  <div className="whitespace-pre-wrap">
                    {summaryQuery.data.details.presentAddress || "-"}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {dailyQuery.data && (
            <div className="mt-6 rounded-md border overflow-hidden">
              <div className="flex items-center justify-between bg-emerald-500 text-white font-semibold px-4 py-2">
                <span>Monthly Calendar</span>
                <span className="text-white/90 text-sm">
                  {parseMonthYear(files.find((f) => f.filename === file)?.originalName)?.label || ""}
                </span>
              </div>
              <div className="px-4 py-3">
                <div className="grid grid-cols-7 gap-2 text-xs font-medium text-muted-foreground mb-2">
                  <div className="text-center">Sun</div>
                  <div className="text-center">Mon</div>
                  <div className="text-center">Tue</div>
                  <div className="text-center">Wed</div>
                  <div className="text-center">Thu</div>
                  <div className="text-center">Fri</div>
                  <div className="text-center">Sat</div>
                </div>
                {(() => {
                  const meta = parseMonthYear(files.find((f) => f.filename === file)?.originalName);
                  const cells = buildCalendarCells(dailyQuery.data!.days, meta?.year, meta?.monthIndex);
                  const rows = [] as (typeof cells)[number][][];
                  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
                  return rows.map((row, ri) => (
                    <div key={ri} className="grid grid-cols-7 gap-2 mb-2">
                      {row.map((cell, ci) => (
                        <div key={ci} className="min-h-[76px] rounded-md border bg-card">
                          {cell ? (
                            <div className="p-2 space-y-1">
                              <div className="inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-semibold bg-muted text-foreground/80">
                                {cell.day}
                              </div>
                              <div className={"text-xs font-medium " + codeColor(cell.code)}>
                                {cell.code || ""}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {cell.ot ? `OT: ${cell.ot}` : ""}
                              </div>
                            </div>
                          ) : (
                            <div className="p-2" />
                          )}
                        </div>
                      ))}
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}

          {!files.length && (
            <div className="rounded-md border p-4 text-sm text-muted-foreground">
              No files uploaded. Go to{" "}
              <a href="/files" className="underline">
                Upload & Files
              </a>{" "}
              to add a monthly Excel file.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function parseMonthYear(name?: string | null) {
  if (!name) return null as null | { year: number; monthIndex: number; label: string };
  const base = name.replace(/\.[^.]+$/, "");
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const regex = new RegExp(`(${months.join("|")})[^0-9]*([12][0-9]{3})`, "i");
  const m = base.match(regex);
  if (!m) return null;
  const monthName = m[1];
  const year = parseInt(m[2], 10);
  const monthIndex = months.findIndex((x) => x.toLowerCase() === monthName.toLowerCase());
  const label = `${months[monthIndex]} ${year}`;
  return { year, monthIndex, label };
}

function buildCalendarCells(days: any[], year?: number, monthIndex?: number) {
  const sorted = [...(days || [])].sort((a, b) => a.day - b.day);
  let leading = 0;
  if (typeof year === "number" && typeof monthIndex === "number") {
    leading = new Date(year, monthIndex, 1).getDay();
  }
  const cells: (any | null)[] = Array(Math.max(0, leading)).fill(null).concat(sorted);
  const trailing = (7 - (cells.length % 7)) % 7;
  for (let i = 0; i < trailing; i++) cells.push(null);
  return cells;
}

function codeColor(code: string) {
  switch (code) {
    case "P":
      return "text-emerald-600";
    case "A":
      return "text-rose-600";
    case "WO":
      return "text-amber-600";
    default:
      return "text-muted-foreground";
  }
}

function StatCard({
  title,
  value,
  color,
}: {
  title: string;
  value: number;
  color: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-extrabold tracking-tight">
          <span
            className={
              color + " inline-block h-3 w-3 rounded-full align-middle mr-2"
            }
          />
          {Number.isFinite(value) ? value : 0}
        </div>
      </CardContent>
    </Card>
  );
}
