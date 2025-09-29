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
            <div className="grid gap-4 sm:grid-cols-5">
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
            </div>
          )}

          {summaryQuery.data?.details && (
            <div className="grid gap-4 sm:grid-cols-3">
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
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">
                    Minus / Kitchen
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  <div>Minus: {summaryQuery.data.summary.minus ?? 0}</div>
                  <div>Kitchen: {summaryQuery.data.summary.kitchen ?? 0}</div>
                </CardContent>
              </Card>
            </div>
          )}

          {dailyQuery.data && (
            <div className="mt-6 rounded-md border overflow-hidden">
              <div className="bg-emerald-500 text-white font-semibold px-4 py-2">
                Monthly Calendar
              </div>
              {chunkDays(dailyQuery.data.days, 11).map((chunk, i) => (
                <div key={i} className="border-t">
                  <Row
                    label="Date:"
                    values={chunk.map((d) => String(d.day))}
                    tone="muted"
                  />
                  <Row
                    label="ATD"
                    values={chunk.map((d) => d.code)}
                    tone="normal"
                  />
                  <Row
                    label="OT"
                    values={chunk.map((d) => (d.ot ? String(d.ot) : ""))}
                    tone="muted"
                  />
                </div>
              ))}
              <div className="border-t bg-muted/50">
                <div className="grid grid-cols-14 gap-2 px-4 py-3 text-sm auto-cols-fr">
                  <div className="font-semibold">P</div>
                  <div>{summaryQuery.data?.summary.present ?? 0}</div>
                  <div className="font-semibold">W</div>
                  <div>{summaryQuery.data?.summary.weekoff ?? 0}</div>
                  <div className="font-semibold">A</div>
                  <div>{summaryQuery.data?.summary.absent ?? 0}</div>
                  <div className="font-semibold">Minus</div>
                  <div>{summaryQuery.data?.summary.minus ?? 0}</div>
                  <div className="font-semibold">ATD</div>
                  <div>{summaryQuery.data?.summary.atd ?? 0}</div>
                  <div className="font-semibold">OT</div>
                  <div>{summaryQuery.data?.summary.otHours ?? 0}</div>
                  <div className="font-semibold">KICHEN</div>
                  <div>{summaryQuery.data?.summary.kitchen ?? 0}</div>
                </div>
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

function chunkDays<T>(days: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < days.length; i += size) out.push(days.slice(i, i + size));
  return out;
}

function Row({
  label,
  values,
  tone,
}: {
  label: string;
  values: string[];
  tone: "muted" | "normal";
}) {
  return (
    <div className="grid grid-cols-[80px_repeat(11,minmax(0,1fr))] items-stretch">
      <div
        className={
          "border-r px-3 py-2 text-sm font-semibold " +
          (tone === "muted" ? "bg-muted/60" : "")
        }
      >
        {label}
      </div>
      {values.map((v, idx) => (
        <div
          key={idx}
          className="px-2 py-2 text-center text-sm border-l first:border-l-0"
        >
          {v}
        </div>
      ))}
    </div>
  );
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
