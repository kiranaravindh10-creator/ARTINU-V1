import { INTERNAL_ROLES, ROLE_LABELS, ROLE_MODULES, type InvitableRole } from '@artinu/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { ShieldAlert } from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { errorMessage } from '@/lib/api';
import { peopleService } from '@/services/people.service';

/** Console roles in the order they are usually given. CEO only for a CEO. */
const STAFF_ROLES: InvitableRole[] = ['operations', 'manager', 'accounts', 'it_team', 'ceo'];

/**
 * Invite a photographer, or create a staff account.
 *
 * Both are the same act: an ARTINU account in a role, and an email with a
 * single-use link to choose a password. Nobody here types, sees or sends a
 * password. An address that already has an account is refused by the server,
 * which names that account - the dialog then offers to open it instead, so an
 * existing photographer is never given a second login.
 */
export function InviteAccessDialog({
  kind,
  open,
  onOpenChange,
}: {
  kind: 'photographer' | 'staff';
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const [fullName, setFullName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState<InvitableRole>(kind === 'photographer' ? 'artist' : 'operations');
  const [existing, setExisting] = React.useState<{ id: string; role: string } | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setFullName('');
    setEmail('');
    setRole(kind === 'photographer' ? 'artist' : 'operations');
    setExisting(null);
  }, [open, kind]);

  const invite = useMutation({
    mutationFn: () => peopleService.invite({ email: email.trim(), fullName: fullName.trim(), role }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'people'] });
      onOpenChange(false);
      if (result.delivered) {
        toast.success(`Invitation sent to ${result.user.email}.`, {
          description: 'They choose their own password from the link. It works once, for seven days.',
        });
      } else {
        toast.warning(`Account created, but the invitation email was not delivered.`, {
          description: 'Resend it from their page once mail is working, or hand over a one-time link.',
        });
      }
      navigate(`/console/users/${result.user.id}`);
    },
    onError: (error) => {
      const body = axios.isAxiosError(error)
        ? (error.response?.data as { code?: string; details?: Record<string, string[]> } | undefined)
        : undefined;
      if (body?.code === 'account_exists' && body.details?.existingUserId?.[0]) {
        setExisting({ id: body.details.existingUserId[0], role: body.details.existingRole?.[0] ?? '' });
        return;
      }
      toast.error(errorMessage(error));
    },
  });

  const roles = STAFF_ROLES.filter((entry) => entry !== 'ceo' || me?.role === 'ceo');
  const ready = fullName.trim().length >= 2 && /^\S+@\S+\.\S+$/.test(email.trim());
  const internal = (INTERNAL_ROLES as readonly string[]).includes(role);

  return (
    <Dialog open={open} onOpenChange={(next) => !invite.isPending && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{kind === 'photographer' ? 'Invite a photographer' : 'Create a staff account'}</DialogTitle>
          <DialogDescription>
            They get an email with a single-use link to choose their own password - good for seven days. Nobody at
            ARTINU sees it.{' '}
            {kind === 'photographer'
              ? 'They sign in to their Studio, never the Console.'
              : 'They sign in at the same page as everyone else and land in the Console.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Full name" htmlFor="invite-name" required>
            <Input id="invite-name" value={fullName} onChange={(event) => setFullName(event.target.value)} autoFocus />
          </Field>
          <Field label="Email" htmlFor="invite-email" required hint={kind === 'staff' ? 'Their work address - they sign in with it.' : undefined}>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setExisting(null);
              }}
              placeholder="name@example.com"
            />
          </Field>

          {kind === 'staff' && (
            <>
              <Field label="Role" htmlFor="invite-role" hint="Decides what they can open and do in the Console.">
                <SimpleSelect
                  id="invite-role"
                  value={role}
                  onValueChange={(value) => setRole(value as InvitableRole)}
                  options={roles.map((entry) => ({ value: entry, label: ROLE_LABELS[entry] }))}
                />
              </Field>
              <div className="rounded-md bg-sand-soft p-3">
                <p className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">This role can open</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(ROLE_MODULES[role] ?? []).map((module) => (
                    <Badge key={module} variant="outline" className="capitalize">
                      {module}
                    </Badge>
                  ))}
                </div>
              </div>
              {internal && (
                <p className="flex items-start gap-2.5 rounded-md border border-warning/30 bg-warning-soft p-3 text-sm text-warning">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {role === 'it_team' && me?.role !== 'ceo'
                    ? 'IT access waits for the CEO to approve it - they cannot sign in until then.'
                    : 'This gives access to the ARTINU Console. Make sure that is intended.'}
                </p>
              )}
              <p className="text-xs text-subtle">
                Need an official @artinu.in address and an employee record as well? Use{' '}
                <Link to="/console/users/employees" className="underline underline-offset-4" onClick={() => onOpenChange(false)}>
                  Employees → Add employee
                </Link>{' '}
                instead.
              </p>
            </>
          )}

          {existing && (
            <div className="rounded-md border border-line bg-sand-soft p-3 text-sm text-ink-soft" role="alert">
              <p>
                {email.trim()} already has an ARTINU account
                {existing.role ? ` (${ROLE_LABELS[existing.role as keyof typeof ROLE_LABELS] ?? existing.role})` : ''}. A
                second one is never created - manage the access of the one they have.
              </p>
              <Button asChild size="sm" variant="outline" className="mt-2">
                <Link to={`/console/users/${existing.id}`} onClick={() => onOpenChange(false)}>
                  Open the existing account
                </Link>
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={invite.isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={invite.isPending} disabled={!ready || Boolean(existing)} onClick={() => invite.mutate()}>
            {kind === 'photographer' ? 'Send invitation' : `Create ${ROLE_LABELS[role]} account`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
