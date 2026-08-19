import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import * as React from 'react';
import { PageHeader } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/display';
import { contentService } from '@/services/content.service';
import { toast } from 'sonner';

function ContentSection({
  id,
  title,
  description,
  label,
  placeholder,
  hint,
  isArray = true,
}: {
  id: string;
  title: string;
  description: string;
  label: string;
  placeholder?: string;
  hint?: string;
  isArray?: boolean;
}) {
  const queryClient = useQueryClient();
  const [value, setValue] = React.useState<string>('');

  const { data, isLoading } = useQuery({
    queryKey: ['content', id],
    queryFn: async () => {
      const res = await contentService.getContent(id);
      return res;
    },
  });

  React.useEffect(() => {
    if (data?.data) {
      if (isArray && Array.isArray(data.data)) {
        setValue(data.data.join(', '));
      } else {
        setValue(JSON.stringify(data.data, null, 2));
      }
    } else {
      setValue('');
    }
  }, [data, isArray]);

  const save = useMutation({
    mutationFn: async (val: string) => {
      let parsedData: any = val;
      if (isArray) {
        parsedData = val.split(',').map(s => s.trim()).filter(Boolean);
      } else {
        try {
          parsedData = JSON.parse(val);
        } catch(e) {
          // just save as string if not json
        }
      }
      return contentService.setContent(id, parsedData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content', id] });
      toast.success(`${title} updated successfully`);
    },
    onError: (err) => {
      toast.error('Failed to update content');
    }
  });

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label={label} htmlFor={id} hint={hint}>
          <Textarea
            id={id}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            rows={4}
          />
        </Field>
        <Button onClick={() => save.mutate(value)} loading={save.isPending}>
          <Save className="mr-2 size-4" /> Save
        </Button>
      </CardContent>
    </Card>
  );
}

export default function ConsoleContentPage() {
  return (
    <div>
      <PageHeader
        title="Curated lists"
        description="Hand-picked lists that sit on top of the automatic ordering. Everything else on the homepage is edited under Homepage."
      />

      {/*
        Three sections used to live here as well, and none of them belonged.

        `homepage_hero` and `dashboard_cafes` were left behind by an earlier
        design: nothing on the site reads either of them any more, so a manager
        could edit the homepage carousel here, save, and watch the homepage not
        change — the worst thing an admin screen can do. The carousel and the
        café collaborations are both edited under Homepage, against the tables
        the site actually reads.

        `featured_artists` was a comma-separated box of user IDs for a list that
        Console → Artists → Featured already manages with names, photographs and
        drag-to-order. One list, one place to edit it.
      */}
      <div className="grid gap-6">
        <ContentSection
          id="gallery_top_20"
          title="Gallery top picks"
          description="Photographs pinned to the top of the gallery page, above the automatic ordering. Leave it empty and the gallery sorts itself."
          label="Photograph IDs"
          hint="Comma-separated. Copy an ID from the end of a photograph's gallery address."
          placeholder="9f1c…, 4ab2…"
        />
      </div>
    </div>
  );
}
