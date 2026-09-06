import {
  CAMPAIGN_FREQUENCIES,
  CAMPAIGN_FREQUENCY_HELP,
  CAMPAIGN_FREQUENCY_LABELS,
  CAMPAIGN_LIMITS,
  CAMPAIGN_POSTER_MAX_BYTES,
  CAMPAIGN_POSTER_TYPES,
  CAMPAIGN_SUBJECTS,
  CAMPAIGN_SUBJECT_LABELS,
  campaignSchema,
  type CampaignFrequency,
  type CampaignInput,
  type CampaignSubject,
} from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageUp, Loader2, Megaphone, X } from 'lucide-react';
import * as React from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PromoCard } from '@/components/PromoPopup';
import { Block, PanelHeader } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { CharCount, Field } from '@/components/ui/field';
import { Switch } from '@/components/ui/checkbox';
import { Input, Textarea } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/select';
import { errorMessage } from '@/lib/api';
import { fileToImageDataUrl, formatBytes } from '@/lib/utils';
import { campaignService } from '@/services/campaign.service';

/**
 * Create or edit one campaign, with the visitor's view of it beside the form.
 *
 * The preview renders {@link PromoCard} — the very component the public site
 * uses — so what the team approves here is what a visitor gets.
 */

/**
 * `datetime-local` speaks 'YYYY-MM-DDTHH:mm' in LOCAL time; the API stores ISO
 * in UTC. These two convert between them.
 *
 * Doing it by string slicing rather than with `toISOString().slice(0,16)` is
 * deliberate: that would render a stored time shifted by the timezone offset,
 * so a campaign set for 9am in Bengaluru would come back into the form reading
 * 3:30am and be silently saved that way on the next edit.
 */
const toLocalInput = (iso: string | null): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const fromLocalInput = (value: string): string =>
  value ? new Date(value).toISOString() : '';

type FormState = {
  title: string;
  description: string;
  imageBase64: string;
  imageUrl: string | null;
  ctaLabel: string;
  ctaUrl: string;
  frequency: CampaignFrequency;
  subject: CampaignSubject;
  subjectId: string | null;
  active: boolean;
  startsAt: string;
  endsAt: string;
};

const EMPTY: FormState = {
  title: '',
  description: '',
  imageBase64: '',
  imageUrl: null,
  ctaLabel: '',
  ctaUrl: '',
  frequency: 'session',
  subject: 'general',
  subjectId: null,
  active: false,
  startsAt: '',
  endsAt: '',
};

export default function SocialMediaCampaignEditorPage() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = Boolean(campaignId);

  /*
    Arriving from a "Promote" button on the artists or spaces screen.

    Read once, as the initial state, rather than in an effect: an effect would
    overwrite the choice if the team then changed the subject by hand, and the
    values are only ever meaningful on the first render of a new campaign.
  */
  const [searchParams] = useSearchParams();
  const [form, setForm] = React.useState<FormState>(() => {
    const subject = searchParams.get('subject');
    const subjectId = searchParams.get('subjectId');
    if (!subject || !(CAMPAIGN_SUBJECTS as readonly string[]).includes(subject)) return EMPTY;
    return { ...EMPTY, subject: subject as CampaignSubject, subjectId: subjectId || null };
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [loadedId, setLoadedId] = React.useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  // The list is already cached by the campaigns screen; reuse it rather than
  // adding a by-id endpoint for a record we have.
  const { data: campaigns, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => campaignService.list(),
    enabled: isEdit,
  });

  React.useEffect(() => {
    if (!isEdit || !campaigns || loadedId === campaignId) return;
    const existing = campaigns.find((campaign) => campaign.id === campaignId);
    if (!existing) return;
    setForm({
      title: existing.title,
      description: existing.description,
      imageBase64: '',
      imageUrl: existing.imageUrl,
      ctaLabel: existing.ctaLabel ?? '',
      ctaUrl: existing.ctaUrl ?? '',
      frequency: existing.frequency,
      subject: existing.subject,
      subjectId: existing.subjectId,
      active: existing.active,
      startsAt: toLocalInput(existing.startsAt),
      endsAt: toLocalInput(existing.endsAt),
    });
    setLoadedId(campaignId!);
  }, [isEdit, campaigns, campaignId, loadedId]);

  // What the team may point a campaign at. Only fetched once they choose to.
  const { data: artists } = useQuery({
    queryKey: ['promotable-artists'],
    queryFn: () => campaignService.promotableArtists(),
    enabled: form.subject === 'artist',
  });
  const { data: spaces } = useQuery({
    queryKey: ['promotable-spaces'],
    queryFn: () => campaignService.promotableSpaces(),
    enabled: form.subject === 'space',
  });

  const save = useMutation({
    mutationFn: (input: CampaignInput) =>
      isEdit ? campaignService.update(campaignId!, input) : campaignService.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      void queryClient.invalidateQueries({ queryKey: ['active-campaign'] });
      toast.success(isEdit ? 'Campaign saved.' : 'Campaign created.');
      navigate('/social-media');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const pickPoster = async (file: File | undefined) => {
    if (!file) return;

    if (!(CAMPAIGN_POSTER_TYPES as readonly string[]).includes(file.type)) {
      toast.error(`${file.name} was skipped. Use a JPG, PNG or WebP.`);
      return;
    }
    if (file.size > CAMPAIGN_POSTER_MAX_BYTES) {
      toast.error(
        `${file.name} is ${formatBytes(file.size)} - the limit is ${
          CAMPAIGN_POSTER_MAX_BYTES / (1024 * 1024)
        } MB.`,
      );
      return;
    }

    set('imageBase64', await fileToImageDataUrl(file));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();

    const candidate = {
      ...form,
      startsAt: fromLocalInput(form.startsAt),
      endsAt: fromLocalInput(form.endsAt),
      imageBase64: form.imageBase64 || undefined,
    };

    /*
      The SAME schema the server validates with, so the form cannot accept
      something the API will refuse - and the messages the team reads are the
      ones written next to the rule.
    */
    const result = campaignSchema.safeParse(candidate);
    if (!result.success) {
      const next: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path.join('.') || 'form';
        next[field] ??= issue.message;
      }
      setErrors(next);
      toast.error('Please check the highlighted fields.');
      return;
    }

    setErrors({});
    save.mutate(result.data);
  };

  // What the preview shows: the new poster if one was just picked, otherwise
  // whatever is already stored.
  const previewImage = form.imageBase64 || form.imageUrl;

  if (isEdit && isLoading) {
    return (
      <div className="flex items-center gap-2.5 py-12 text-sm text-muted">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Loading campaign…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PanelHeader
        icon={Megaphone}
        title={isEdit ? 'Edit campaign' : 'Create campaign'}
        description="This is the card a visitor sees when they arrive on the site. Keep it to one idea and one button."
      />

      <form onSubmit={submit} className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-9">
          <Block label="The message">
            <div className="space-y-5">
              <Field
                label="Title"
                htmlFor="title"
                required
                error={errors.title}
                aside={<CharCount value={form.title} max={CAMPAIGN_LIMITS.title.max} />}
              >
                <Input
                  id="title"
                  value={form.title}
                  onChange={(event) => set('title', event.target.value)}
                  placeholder="Get 10% off our latest collection"
                  invalid={Boolean(errors.title)}
                />
              </Field>

              <Field
                label="Short description"
                htmlFor="description"
                hint="One or two lines. Optional."
                error={errors.description}
                aside={
                  <CharCount value={form.description} max={CAMPAIGN_LIMITS.description.max} />
                }
              >
                <Textarea
                  id="description"
                  rows={3}
                  value={form.description}
                  onChange={(event) => set('description', event.target.value)}
                  placeholder="Framed photography for your walls, rotated every season."
                  invalid={Boolean(errors.description)}
                />
              </Field>
            </div>
          </Block>

          <Block label="Poster" hint="JPG, PNG or WebP, up to 5 MB">
            {previewImage ? (
              <div className="relative w-full max-w-sm overflow-hidden rounded-lg border border-line">
                <img src={previewImage} alt="" className="h-44 w-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    set('imageBase64', '');
                    set('imageUrl', null);
                  }}
                  aria-label="Remove the poster"
                  className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-canvas/90 text-ink shadow-subtle backdrop-blur-md"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong px-6 py-10 text-center transition-colors hover:bg-sand-soft">
                <ImageUp className="size-5 text-subtle" aria-hidden />
                <span className="text-sm text-muted">Add a poster</span>
                <span className="text-xs text-subtle">Optional — a campaign can be text only</span>
                <input
                  type="file"
                  accept={CAMPAIGN_POSTER_TYPES.join(',')}
                  className="sr-only"
                  onChange={(event) => {
                    void pickPoster(event.target.files?.[0]);
                    // Let the same file be chosen again after a removal.
                    event.target.value = '';
                  }}
                />
              </label>
            )}
          </Block>

          <Block label="Button" hint="Leave both blank for a campaign with no button">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Button text" htmlFor="ctaLabel" error={errors.ctaLabel}>
                <Input
                  id="ctaLabel"
                  value={form.ctaLabel}
                  onChange={(event) => set('ctaLabel', event.target.value)}
                  placeholder="Browse the collection"
                  invalid={Boolean(errors.ctaLabel)}
                />
              </Field>

              <Field
                label="Where it goes"
                htmlFor="ctaUrl"
                hint="A page on this site (/gallery) or a full https:// address"
                error={errors.ctaUrl}
              >
                <Input
                  id="ctaUrl"
                  value={form.ctaUrl}
                  onChange={(event) => set('ctaUrl', event.target.value)}
                  placeholder="/gallery"
                  invalid={Boolean(errors.ctaUrl)}
                />
              </Field>
            </div>
          </Block>

          <Block
            label="What this promotes"
            hint="Pick an artist or a space to keep the campaign tied to real work"
          >
            <div className="space-y-5">
              <Field label="Kind" htmlFor="subject">
                <SimpleSelect
                  id="subject"
                  value={form.subject}
                  onValueChange={(value) => {
                    set('subject', value as CampaignSubject);
                    // The previous choice belongs to the previous kind.
                    set('subjectId', null);
                  }}
                  options={CAMPAIGN_SUBJECTS.map((subject) => ({
                    value: subject,
                    label: CAMPAIGN_SUBJECT_LABELS[subject],
                  }))}
                />
              </Field>

              {form.subject === 'artist' && (
                <Field label="Which artist" htmlFor="artist" error={errors.subjectId}>
                  <SimpleSelect
                    id="artist"
                    value={form.subjectId ?? ''}
                    onValueChange={(value) => set('subjectId', value)}
                    placeholder={artists ? 'Choose an artist' : 'Loading artists…'}
                    invalid={Boolean(errors.subjectId)}
                    options={(artists ?? []).map((artist) => ({
                      value: artist.id,
                      label: `${artist.displayName} — ${artist.artworkCount} photographs`,
                    }))}
                  />
                </Field>
              )}

              {form.subject === 'space' && (
                <Field label="Which space" htmlFor="space" error={errors.subjectId}>
                  <SimpleSelect
                    id="space"
                    value={form.subjectId ?? ''}
                    onValueChange={(value) => set('subjectId', value)}
                    placeholder={spaces ? 'Choose a space' : 'Loading spaces…'}
                    invalid={Boolean(errors.subjectId)}
                    options={(spaces ?? []).map((space) => ({
                      value: space.id,
                      label: `${space.name} — ${space.city}`,
                    }))}
                  />
                </Field>
              )}
            </div>
          </Block>

          <Block label="When and how often">
            <div className="space-y-5">
              <Field
                label="How often one visitor sees it"
                htmlFor="frequency"
                hint={CAMPAIGN_FREQUENCY_HELP[form.frequency]}
              >
                <SimpleSelect
                  id="frequency"
                  value={form.frequency}
                  onValueChange={(value) => set('frequency', value as CampaignFrequency)}
                  options={CAMPAIGN_FREQUENCIES.map((frequency) => ({
                    value: frequency,
                    label: CAMPAIGN_FREQUENCY_LABELS[frequency],
                  }))}
                />
              </Field>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  label="Starts"
                  htmlFor="startsAt"
                  hint="Leave blank to start as soon as it is switched on"
                  error={errors.startsAt}
                >
                  <Input
                    id="startsAt"
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={(event) => set('startsAt', event.target.value)}
                    invalid={Boolean(errors.startsAt)}
                  />
                </Field>

                <Field
                  label="Ends"
                  htmlFor="endsAt"
                  hint="Leave blank to run until you stop it"
                  error={errors.endsAt}
                >
                  <Input
                    id="endsAt"
                    type="datetime-local"
                    value={form.endsAt}
                    onChange={(event) => set('endsAt', event.target.value)}
                    invalid={Boolean(errors.endsAt)}
                  />
                </Field>
              </div>

              <div className="flex items-start gap-3.5 rounded-lg border border-line bg-canvas-soft p-4">
                <Switch
                  id="active"
                  checked={form.active}
                  onCheckedChange={(checked) => set('active', checked)}
                  className="mt-0.5"
                />
                <label htmlFor="active" className="min-w-0 cursor-pointer">
                  <span className="block text-sm font-medium text-ink">
                    Start this campaign now
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    Leave this off to save it as a draft. You can start it from the campaigns
                    list at any time.
                  </span>
                </label>
              </div>
            </div>
          </Block>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={save.isPending}>
              {isEdit ? 'Save changes' : 'Create campaign'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => navigate('/social-media')}>
              Cancel
            </Button>
          </div>
        </div>

        {/*
          The preview. `lg:sticky` keeps it beside the form while the form
          scrolls, which is the whole point of putting it here rather than
          behind a button.
        */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <p className="eyebrow eyebrow-muted mb-3">Preview</p>
          <div className="relative w-full overflow-hidden rounded-xl border border-line bg-canvas shadow-lg">
            <PromoCard
              campaign={{
                title: form.title || 'Your campaign title',
                description: form.description,
                imageUrl: previewImage || null,
                ctaLabel: form.ctaLabel || null,
                ctaUrl: form.ctaUrl || null,
              }}
            />
          </div>
          <p className="mt-3 text-xs text-subtle">
            This is exactly what a visitor sees, in the bottom corner of the page on a computer
            and across the bottom on a phone.
          </p>
        </aside>
      </form>
    </div>
  );
}
