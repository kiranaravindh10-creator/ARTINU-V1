import { formatDate } from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Mail, Plus, UserMinus, Users } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/DashboardShell';
import { SubNav } from '@/features/console/components/SubNav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/display';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { errorMessage } from '@/lib/api';
import { operationsService, type Employee } from '@/services/operations.service';

/** Roles an employee account can hold. 'ceo' is deliberately not offered here. */
const ROLE_OPTIONS = [
  { value: 'operations', label: 'Operations' },
  { value: 'manager', label: 'Manager' },
  { value: 'accounts', label: 'Accounts' },
  { value: 'it_team', label: 'IT Team' },
];

const STATUS_BADGE: Record<Employee['status'], 'success' | 'neutral' | 'danger'> = {
  active: 'success',
  suspended: 'danger',
  offboarded: 'neutral',
};

/**
 * Shows the address that will be generated as the name is typed, so whoever is
 * onboarding can see it before committing. Mirrors generateCompanyEmail on the
 * server — the server remains the authority, including the collision suffix.
 */
function previewCompanyEmail(fullName: string): string {
  const parts = fullName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return '';
  const base = parts.length > 1 ? `${parts[0]}.${parts[parts.length - 1]}` : parts[0];
  return `${base}@artinu.in`;
}

export default function ConsoleEmployeesPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);

  const { data: employees, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['ops', 'employees'],
    queryFn: () => operationsService.employees(),
  });

  const create = useMutation({
    mutationFn: operationsService.createEmployee,
    onSuccess: (employee) => {
      void queryClient.invalidateQueries({ queryKey: ['ops', 'employees'] });
      setOpen(false);
      toast.success(`${employee.fullName} added`, {
        description: `${employee.companyEmail} - a password setup link has been emailed.`,
      });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const offboard = useMutation({
    mutationFn: operationsService.offboardEmployee,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ops', 'employees'] });
      toast.success('Employee offboarded and their sign-in suspended.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const active = (employees ?? []).filter((entry) => entry.status === 'active');

  return (
    <div>
      <PageHeader
        title="People &amp; access"
        description="Staff accounts, official email addresses and role-based access."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus /> Add employee
          </Button>
        }
      />
      <SubNav
        items={[
          { to: '/console/users', label: 'Accounts', end: true },
          { to: '/console/users/employees', label: 'Employees' },
          { to: '/console/users/audit', label: 'Audit trail' },
        ]}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-subtle">Active staff</p>
            <p className="mt-1 font-display text-2xl text-ink">{active.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-subtle">Total records</p>
            <p className="mt-1 font-display text-2xl text-ink">{employees?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-subtle">Email domain</p>
            <p className="mt-1 font-mono text-sm text-ink">@artinu.in</p>
          </CardContent>
        </Card>
      </div>

      {isError ? (
        <ErrorState
          title="Employee list unavailable."
          error={error}
          onRetry={() => void refetch()}
        />
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : employees && employees.length > 0 ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Official email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Added</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink">{employee.fullName}</p>
                      <p className="font-mono text-xs text-subtle">{employee.employeeCode}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-ink">
                      <Mail className="size-3.5 text-bronze" aria-hidden />
                      {employee.companyEmail}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="bronze">{employee.jobTitle}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted">{employee.department ?? '-'}</TableCell>
                  <TableCell className="text-sm text-muted">
                    {formatDate(employee.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Badge variant={STATUS_BADGE[employee.status]}>{employee.status}</Badge>
                      {employee.status === 'active' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Offboard ${employee.fullName}`}
                          loading={offboard.isPending}
                          onClick={() => offboard.mutate(employee.id)}
                        >
                          <UserMinus className="size-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <EmptyState
          icon={<Users />}
          title="No employees yet."
          description="Add your first team member - ARTINU generates their official email and sends a secure setup link."
          action={<Button onClick={() => setOpen(true)}>Add employee</Button>}
        />
      )}

      <AddEmployeeDialog
        open={open}
        onOpenChange={setOpen}
        pending={create.isPending}
        onSubmit={(values) => create.mutate(values)}
      />
    </div>
  );
}

function AddEmployeeDialog({
  open,
  onOpenChange,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onSubmit: (values: {
    fullName: string;
    jobTitle: string;
    role: string;
    department?: string | null;
    personalEmail?: string | null;
    phone?: string | null;
  }) => void;
}) {
  const [fullName, setFullName] = React.useState('');
  const [jobTitle, setJobTitle] = React.useState('');
  const [role, setRole] = React.useState('operations');
  const [department, setDepartment] = React.useState('');
  const [personalEmail, setPersonalEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');

  React.useEffect(() => {
    if (!open) {
      setFullName('');
      setJobTitle('');
      setRole('operations');
      setDepartment('');
      setPersonalEmail('');
      setPhone('');
    }
  }, [open]);

  const preview = previewCompanyEmail(fullName);
  const ready = fullName.trim().length >= 2 && jobTitle.trim().length >= 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add an employee</DialogTitle>
          <DialogDescription>
            ARTINU creates the account, generates their official address and emails a one-time link
            so they can set their own password. No password is ever sent by email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Full name" htmlFor="employee-name" required>
            <Input
              id="employee-name"
              placeholder="Kiran Rao"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          </Field>

          {preview && (
            <div className="rounded-md border border-bronze/30 bg-bronze-soft/40 px-4 py-3">
              <p className="flex items-center gap-2 text-xs text-muted">
                <BadgeCheck className="size-3.5 text-bronze" aria-hidden />
                Official email will be
              </p>
              <p className="mt-1 font-mono text-sm text-ink">{preview}</p>
              <p className="mt-1 text-xs text-subtle">
                A number is appended automatically if that address is already taken.
              </p>
            </div>
          )}

          <Field label="Job title" htmlFor="employee-title" required>
            <Input
              id="employee-title"
              placeholder="Frame Installer"
              value={jobTitle}
              onChange={(event) => setJobTitle(event.target.value)}
            />
          </Field>

          <Field label="Access level" hint="Controls which console areas they can reach">
            <SimpleSelect value={role} onValueChange={setRole} options={ROLE_OPTIONS} />
          </Field>

          <Field label="Team" htmlFor="employee-dept" hint="Optional">
            <Input
              id="employee-dept"
              placeholder="Installation"
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
            />
          </Field>

          <Field
            label="Personal email"
            htmlFor="employee-personal"
            hint="Where the setup link is sent - their ARTINU mailbox may not exist yet"
          >
            <Input
              id="employee-personal"
              type="email"
              placeholder="kiran@gmail.com"
              value={personalEmail}
              onChange={(event) => setPersonalEmail(event.target.value)}
            />
          </Field>

          <Field label="Phone" htmlFor="employee-phone" hint="Optional">
            <Input
              id="employee-phone"
              placeholder="98765 43210"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            loading={pending}
            disabled={!ready}
            onClick={() =>
              onSubmit({
                fullName: fullName.trim(),
                jobTitle: jobTitle.trim(),
                role,
                department: department.trim() || null,
                personalEmail: personalEmail.trim() || null,
                phone: phone.trim() || null,
              })
            }
          >
            Create account &amp; send invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
