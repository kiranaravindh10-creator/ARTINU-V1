import type { ExpenseCategory } from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ErrorState, Skeleton } from '@/components/ui/display';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { qk } from '@/lib/query';
import { financeService } from '@/services/finance.service';

/**
 * The expense categories, for whoever holds expenses.manage_categories.
 *
 * Categories are retired rather than deleted: expenses already filed under one
 * keep it, and the reports that group by category keep adding up.
 */
export function ExpenseCategoriesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState('');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.admin.expenseCategories(true),
    queryFn: () => financeService.categories(true),
    enabled: open,
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['admin', 'expense-categories'] });

  const add = useMutation({
    mutationFn: () =>
      financeService.createCategory({
        name: name.trim(),
        active: true,
        sortOrder: Math.min(1000, Math.max(0, ...(data ?? []).map((category) => category.sortOrder)) + 10),
      }),
    onSuccess: (created) => {
      toast.success(`${created.name} added.`);
      setName('');
      refresh();
    },
    onError: (mutationError) => toast.error(errorMessage(mutationError)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Expense categories</DialogTitle>
          <DialogDescription>
            Rename, add or retire. A retired category disappears from the form but stays on the expenses already filed under it.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim().length >= 2) add.mutate();
          }}
        >
          <Input
            aria-label="New category name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New category"
            maxLength={80}
          />
          <Button type="submit" variant="outline" loading={add.isPending} disabled={name.trim().length < 2}>
            <Plus /> Add
          </Button>
        </form>

        {isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {(data ?? []).map((category) => (
              <CategoryRow key={category.id} category={category} onSaved={refresh} />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CategoryRow({ category, onSaved }: { category: ExpenseCategory; onSaved: () => void }) {
  const [name, setName] = React.useState(category.name);
  React.useEffect(() => setName(category.name), [category.name]);

  const save = useMutation({
    mutationFn: (patch: { name?: string; active?: boolean }) =>
      financeService.updateCategory(category.id, {
        name: patch.name ?? category.name,
        description: category.description ?? null,
        active: patch.active ?? category.active,
        sortOrder: category.sortOrder,
      }),
    onSuccess: (updated) => {
      toast.success(updated.active ? `${updated.name} saved.` : `${updated.name} retired.`);
      onSaved();
    },
    onError: (mutationError) => toast.error(errorMessage(mutationError)),
  });

  const renamed = name.trim() !== category.name && name.trim().length >= 2;

  return (
    <li className="flex items-center gap-3 py-2.5">
      <Input
        aria-label={`Name of ${category.name}`}
        value={name}
        onChange={(event) => setName(event.target.value)}
        className={category.active ? 'h-9' : 'h-9 text-subtle'}
        maxLength={80}
      />
      {renamed && (
        <Button size="sm" variant="outline" loading={save.isPending} onClick={() => save.mutate({ name: name.trim() })}>
          Save
        </Button>
      )}
      <label className="flex shrink-0 items-center gap-2 text-xs text-muted">
        <Switch
          checked={category.active}
          disabled={save.isPending}
          onCheckedChange={(active) => save.mutate({ active })}
          aria-label={category.active ? `Retire ${category.name}` : `Restore ${category.name}`}
        />
        {category.active ? 'In use' : 'Retired'}
      </label>
    </li>
  );
}
