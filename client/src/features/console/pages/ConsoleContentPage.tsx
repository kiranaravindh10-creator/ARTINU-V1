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
        title="UI Content Manager"
        description="Manage the dynamic content and featured sections across the platform."
      />

      <div className="grid gap-6">
        <ContentSection
          id="homepage_hero"
          title="Homepage Hero Carousel"
          description="The artworks displayed in the main top-of-page carousel on the homepage."
          label="Artwork IDs"
          hint="Comma-separated list of Artwork IDs."
          placeholder="art_123, art_456, art_789"
        />

        <ContentSection
          id="featured_artists"
          title="Featured Artists"
          description="The artists showcased in the 'Featured Artists' section on the homepage."
          label="Artist IDs"
          hint="Comma-separated list of User IDs of the artists."
          placeholder="usr_123, usr_456"
        />

        <ContentSection
          id="gallery_top_20"
          title="Gallery Top 20"
          description="The artworks forcefully placed at the top of the main gallery page."
          label="Artwork IDs"
          hint="Comma-separated list of Artwork IDs."
          placeholder="art_123, art_456"
        />

        <ContentSection
          id="dashboard_cafes"
          title="Collaborated Cafes (Dashboard Panel)"
          description="The images that cross-fade in the photographer dashboard's right panel."
          label="Image URLs (JSON Array)"
          hint="A valid JSON array of image URLs."
          isArray={false}
          placeholder='[
  "https://images.unsplash.com/photo-...",
  "https://images.unsplash.com/photo-..."
]'
        />
      </div>
    </div>
  );
}
