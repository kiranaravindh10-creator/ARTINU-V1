import { SUPPORT_SESSION_MINUTES } from '@artinu/shared';
import { useMutation } from '@tanstack/react-query';
import { LifeBuoy, ShieldCheck } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
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
import { Textarea } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { beginSupportSession } from '@/lib/support-session';
import { peopleService } from '@/services/people.service';

/**
 * Starting a support session: a reason, and a plain statement of what the
 * session is and is not, before anything happens.
 */
export function AssistUserDialog({
  user,
  open,
  onOpenChange,
}: {
  user: { id: string; email: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = React.useState('');

  React.useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const start = useMutation({
    mutationFn: () => peopleService.startSupportSession(user!.id, reason.trim()),
    onSuccess: (grant) => {
      try {
        beginSupportSession(grant, `/console/users/${user!.id}`);
      } catch (error) {
        toast.error(errorMessage(error));
      }
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <LifeBuoy className="size-5 text-bronze" aria-hidden /> Assist {user?.name}
          </DialogTitle>
          <DialogDescription>
            See ARTINU exactly as {user?.email} sees it, to work out what is going wrong for them.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 rounded-md bg-sand-soft p-4 text-[0.8125rem] text-ink-soft">
          {[
            'Read-only: nothing can be changed, paid for or sent while you are in it.',
            `Ends by itself after ${SUPPORT_SESSION_MINUTES} minutes, or when you choose Exit.`,
            'You never see their password, and your own session is kept for when you leave.',
            'Recorded with your name and this reason. They are told it happened, and why.',
          ].map((line) => (
            <li key={line} className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-bronze" aria-hidden />
              {line}
            </li>
          ))}
        </ul>

        <Field
          label="Why are you opening this account?"
          htmlFor="assist-reason"
          required
          hint="At least 10 characters. The account holder sees this."
        >
          <Textarea
            id="assist-reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Customer called - their order history shows as empty"
          />
        </Field>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            loading={start.isPending}
            disabled={reason.trim().length < 10 || !user}
            onClick={() => start.mutate()}
          >
            Start support session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
