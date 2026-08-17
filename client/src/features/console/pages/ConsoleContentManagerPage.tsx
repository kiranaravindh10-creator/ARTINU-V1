import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  GripVertical,
  Image,
  Plus,
  Search,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Upload,
} from 'lucide-react';
import * as React from 'react';
import { arrayMove, useSortable } from '@dnd-kit/sortable';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { PageHeader } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/display';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/field';
import { Switch } from '@/components/ui/checkbox';
import { Photo } from '@/components/ui/photo';
import { contentService } from '@/services/content.service';
import { toast } from 'sonner';
import type { HeroSlide, FeaturedCollection, Cafe, CreateHeroSlideInput, UpdateHeroSlideInput, CreateFeaturedCollectionInput, UpdateFeaturedCollectionInput, CreateCafeInput, UpdateCafeInput } from '@artinu/shared';

interface SortableItemProps<T> {
  item: T;
  index: number;
  render: (item: T, index: number, isDragging: boolean) => React.ReactNode;
}

function SortableItem<T extends { id: string }>({ item, index, render }: SortableItemProps<T>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, data: { index } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {render(item, index, isDragging)}
    </div>
  );
}

function SortableList<T extends { id: string }>({
  items,
  onDragEnd,
  children: renderItem,
}: {
  items: T[];
  onDragEnd: (items: T[]) => void;
  children: (item: T, index: number, isDragging: boolean) => React.ReactNode;
}): React.ReactElement {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => {
      const { active, over } = e;
      if (over && active.id !== over.id) {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex);
        onDragEnd(newItems);
      }
    }}>
      {items.map((item, index) => (
        <SortableItem key={item.id} item={item} index={index} render={renderItem} />
      ))}
    </DndContext>
  );
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center text-muted">
      <p className="font-medium text-ink">{title}</p>
      <p className="text-sm max-w-xs">{description}</p>
      {action}
    </div>
  );
}

// ── Hero Slides Tab ──────────────────────────────────────────────────────────

function HeroSlidesTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState('');

  const { data: slides, isLoading } = useQuery({
    queryKey: ['content-manager', 'hero-slides'],
    queryFn: () => contentService.getHeroSlides(),
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateHeroSlideInput) => contentService.createHeroSlide(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-manager', 'hero-slides'] });
      toast.success('Hero slide added');
    },
    onError: () => toast.error('Failed to add slide'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateHeroSlideInput }) => contentService.updateHeroSlide(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['content-manager', 'hero-slides'] }),
    onError: () => toast.error('Failed to update slide'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => contentService.deleteHeroSlide(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-manager', 'hero-slides'] });
      toast.success('Slide deleted');
    },
    onError: () => toast.error('Failed to delete slide'),
  });

  const reorderMutation = useMutation({
    mutationFn: (items: { id: string; order: number }[]) => contentService.reorderHeroSlides(items),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['content-manager', 'hero-slides'] }),
  });

  const handleToggleActive = (slide: HeroSlide) => {
    updateMutation.mutate({ id: slide.id, input: { isActive: !slide.isActive } });
  };

  const handleReorder = (newSlides: HeroSlide[]) => {
    const reorderItems = newSlides.map((slide, index) => ({ id: slide.id, order: index }));
    reorderMutation.mutate(reorderItems);
  };

  const filteredSlides = slides?.items.filter((slide) =>
    slide.photographerId.toLowerCase().includes(search.toLowerCase()) ||
    slide.imageUrl.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Hero Carousel Slides</CardTitle>
          <CardDescription>Manage the hero carousel on the homepage. Drag to reorder.</CardDescription>
        </div>
        <CreateSlideDialog onCreate={(input) => createMutation.mutate(input)} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-4">
          <Field
            label="Search slides"
            htmlFor="hero-search"
            className="flex-1 max-w-md"
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted" />
              <Input
                id="hero-search"
                placeholder="Search by photographer ID or image URL..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </Field>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : filteredSlides.length === 0 ? (
          <EmptyState
            title="No hero slides"
            description="Create your first hero slide to display in the homepage carousel."
            action={<CreateSlideDialog onCreate={(input) => createMutation.mutate(input)} />}
          />
        ) : (
          <SortableList items={filteredSlides} onDragEnd={handleReorder}>
            {(slide, index, isDragging) => (
              <div
                className={`
                  flex items-center gap-4 p-4 border border-line rounded-lg bg-surface
                  transition-all ${isDragging ? 'shadow-lg ring-2 ring-bronze/30' : ''}
                `}
              >
                <button
                  className="text-muted hover:text-ink cursor-grab active:cursor-grabbing"
                  aria-label="Drag to reorder"
                >
                  <GripVertical className="size-5" />
                </button>
                <Photo
                  src={slide.imageUrl}
                  alt={`Hero slide ${slide.photographerId}`}
                  ratio="aspect-[16/9]"
                  className="w-32 h-18 rounded overflow-hidden flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
                    Photographer: {slide.photographerId.slice(0, 8)}…
                  </p>
                  <p className="text-sm text-ink truncate">{slide.imageUrl}</p>
                  <p className="text-xs text-muted">Order: {slide.order}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={slide.isActive}
                    onCheckedChange={() => handleToggleActive(slide)}
                    disabled={updateMutation.isPending}
                  />
                  <span className="text-sm">{slide.isActive ? 'Active' : 'Inactive'}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMutation.mutate(slide.id)}
                    disabled={deleteMutation.isPending}
                    className="text-danger hover:bg-danger/10"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            )}
          </SortableList>
        )}
      </CardContent>
    </Card>
  );
}

function CreateSlideDialog({ onCreate }: { onCreate: (input: CreateHeroSlideInput) => void }) {
  const [open, setOpen] = React.useState(false);
  const [imageUrl, setImageUrl] = React.useState('');
  const [photographerId, setPhotographerId] = React.useState('');
  const [isActive, setIsActive] = React.useState(true);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-2 size-4" /> Add Slide
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Hero Slide</DialogTitle>
            <DialogDescription>Select a photographer and image for the homepage carousel.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Field label="Image URL" htmlFor="slide-image">
              <Input
                id="slide-image"
                placeholder="https://images.unsplash.com/photo-..."
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
              />
            </Field>
            <Field label="Photographer ID" htmlFor="slide-photographer">
              <Input
                id="slide-photographer"
                placeholder="usr_abc123..."
                value={photographerId}
                onChange={(e) => setPhotographerId(e.target.value)}
              />
            </Field>
            <Field label="Status" htmlFor="slide-active">
              <Switch
                id="slide-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => { onCreate({ imageUrl, photographerId, isActive }); setOpen(false); }} disabled={!imageUrl || !photographerId}>
              Add Slide
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Featured Collections Tab ─────────────────────────────────────────────────

function FeaturedCollectionsTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState('');

  const { data: collections, isLoading } = useQuery({
    queryKey: ['content-manager', 'featured-collections'],
    queryFn: () => contentService.getFeaturedCollections(),
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateFeaturedCollectionInput) => contentService.createFeaturedCollection(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-manager', 'featured-collections'] });
      toast.success('Collection added');
    },
    onError: () => toast.error('Failed to add collection'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateFeaturedCollectionInput }) => contentService.updateFeaturedCollection(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['content-manager', 'featured-collections'] }),
    onError: () => toast.error('Failed to update collection'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => contentService.deleteFeaturedCollection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-manager', 'featured-collections'] });
      toast.success('Collection deleted');
    },
    onError: () => toast.error('Failed to delete collection'),
  });

  const reorderMutation = useMutation({
    mutationFn: (items: { id: string; order: number }[]) => contentService.reorderFeaturedCollections(items),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['content-manager', 'featured-collections'] }),
  });

  const handleToggleActive = (fc: FeaturedCollection) => {
    updateMutation.mutate({ id: fc.id, input: { isActive: !fc.isActive } });
  };

  const handleReorder = (newCollections: FeaturedCollection[]) => {
    const reorderItems = newCollections.map((fc, index) => ({ id: fc.id, order: index }));
    reorderMutation.mutate(reorderItems);
  };

  const filteredCollections = collections?.items.filter((fc) =>
    fc.collectionId.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Featured Collections</CardTitle>
          <CardDescription>Manage which collections appear in the Featured section. Drag to reorder.</CardDescription>
        </div>
        <CreateCollectionDialog onCreate={(input) => createMutation.mutate(input)} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-4">
          <Field
            label="Search collections"
            htmlFor="fc-search"
            className="flex-1 max-w-md"
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted" />
              <Input
                id="fc-search"
                placeholder="Search by collection ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </Field>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : filteredCollections.length === 0 ? (
          <EmptyState
            title="No featured collections"
            description="Add collections to feature them on the homepage."
            action={<CreateCollectionDialog onCreate={(input) => createMutation.mutate(input)} />}
          />
        ) : (
          <SortableList items={filteredCollections} onDragEnd={handleReorder}>
            {(fc, index, isDragging) => (
              <div
                className={`
                  flex items-center gap-4 p-4 border border-line rounded-lg bg-surface
                  transition-all ${isDragging ? 'shadow-lg ring-2 ring-bronze/30' : ''}
                `}
              >
                <button
                  className="text-muted hover:text-ink cursor-grab active:cursor-grabbing"
                  aria-label="Drag to reorder"
                >
                  <GripVertical className="size-5" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
                    Collection: {fc.collectionId.slice(0, 8)}…
                  </p>
                  <p className="text-sm text-ink truncate">{fc.collectionId}</p>
                  <p className="text-xs text-muted">Order: {fc.order}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={fc.isActive}
                    onCheckedChange={() => handleToggleActive(fc)}
                    disabled={updateMutation.isPending}
                  />
                  <span className="text-sm">{fc.isActive ? 'Active' : 'Inactive'}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMutation.mutate(fc.id)}
                    disabled={deleteMutation.isPending}
                    className="text-danger hover:bg-danger/10"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            )}
          </SortableList>
        )}
      </CardContent>
    </Card>
  );
}

function CreateCollectionDialog({ onCreate }: { onCreate: (input: CreateFeaturedCollectionInput) => void }) {
  const [open, setOpen] = React.useState(false);
  const [collectionId, setCollectionId] = React.useState('');
  const [isActive, setIsActive] = React.useState(true);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-2 size-4" /> Add Collection
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Featured Collection</DialogTitle>
            <DialogDescription>Select a collection to feature on the homepage.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Field label="Collection ID" htmlFor="fc-id">
              <Input
                id="fc-id"
                placeholder="col_abc123..."
                value={collectionId}
                onChange={(e) => setCollectionId(e.target.value)}
              />
            </Field>
            <Field label="Status" htmlFor="fc-active">
              <Switch
                id="fc-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => { onCreate({ collectionId, isActive }); setOpen(false); }} disabled={!collectionId}>
              Add Collection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Cafes Tab ────────────────────────────────────────────────────────────────

function CafesTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState('');

  const { data: cafes, isLoading } = useQuery({
    queryKey: ['content-manager', 'cafes'],
    queryFn: () => contentService.getCafes(),
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateCafeInput) => contentService.createCafe(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-manager', 'cafes'] });
      toast.success('Cafe added');
    },
    onError: () => toast.error('Failed to add cafe'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCafeInput }) => contentService.updateCafe(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['content-manager', 'cafes'] }),
    onError: () => toast.error('Failed to update cafe'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => contentService.deleteCafe(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-manager', 'cafes'] });
      toast.success('Cafe deleted');
    },
    onError: () => toast.error('Failed to delete cafe'),
  });

  const reorderMutation = useMutation({
    mutationFn: (items: { id: string; order: number }[]) => contentService.reorderCafes(items),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['content-manager', 'cafes'] }),
  });

  const handleToggleActive = (cafe: Cafe) => {
    updateMutation.mutate({ id: cafe.id, input: { isActive: !cafe.isActive } });
  };

  const handleReorder = (newCafes: Cafe[]) => {
    const reorderItems = newCafes.map((cafe, index) => ({ id: cafe.id, order: index }));
    reorderMutation.mutate(reorderItems);
  };

  const filteredCafes = cafes?.items.filter((cafe) =>
    cafe.name.toLowerCase().includes(search.toLowerCase()) ||
    cafe.description.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Café Collaborations</CardTitle>
          <CardDescription>Manage the café carousel on the homepage. Drag to reorder.</CardDescription>
        </div>
        <CreateCafeDialog onCreate={(input) => createMutation.mutate(input)} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-4">
          <Field
            label="Search cafés"
            htmlFor="cafe-search"
            className="flex-1 max-w-md"
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted" />
              <Input
                id="cafe-search"
                placeholder="Search by name or description..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </Field>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : filteredCafes.length === 0 ? (
          <EmptyState
            title="No cafés"
            description="Add cafés to display them in the homepage collaborations carousel."
            action={<CreateCafeDialog onCreate={(input) => createMutation.mutate(input)} />}
          />
        ) : (
          <SortableList items={filteredCafes} onDragEnd={handleReorder}>
            {(cafe, index, isDragging) => (
              <div
                className={`
                  flex items-center gap-4 p-4 border border-line rounded-lg bg-surface
                  transition-all ${isDragging ? 'shadow-lg ring-2 ring-bronze/30' : ''}
                `}
              >
                <button
                  className="text-muted hover:text-ink cursor-grab active:cursor-grabbing"
                  aria-label="Drag to reorder"
                >
                  <GripVertical className="size-5" />
                </button>
                <Photo
                  src={cafe.photoUrl}
                  alt={cafe.name}
                  ratio="aspect-square"
                  className="w-20 h-20 rounded overflow-hidden flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-ink truncate">{cafe.name}</p>
                  <p className="text-sm text-muted truncate">{cafe.description}</p>
                  <p className="text-xs text-muted">Order: {cafe.order}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={cafe.isActive}
                    onCheckedChange={() => handleToggleActive(cafe)}
                    disabled={updateMutation.isPending}
                  />
                  <span className="text-sm">{cafe.isActive ? 'Active' : 'Inactive'}</span>
                  <EditCafeDialog cafe={cafe} onUpdate={(id, input) => updateMutation.mutate({ id, input })} />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMutation.mutate(cafe.id)}
                    disabled={deleteMutation.isPending}
                    className="text-danger hover:bg-danger/10"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            )}
          </SortableList>
        )}
      </CardContent>
    </Card>
  );
}

function CreateCafeDialog({ onCreate }: { onCreate: (input: CreateCafeInput) => void }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [photoUrl, setPhotoUrl] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [isActive, setIsActive] = React.useState(true);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-2 size-4" /> Add Café
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Café Collaboration</DialogTitle>
            <DialogDescription>Add a café to the homepage collaborations carousel.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Field label="Name" htmlFor="cafe-name">
              <Input
                id="cafe-name"
                placeholder="Café name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Photo URL" htmlFor="cafe-photo">
              <Input
                id="cafe-photo"
                placeholder="https://images.unsplash.com/photo-..."
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
              />
            </Field>
            <Field label="Description" htmlFor="cafe-desc">
              <Textarea
                id="cafe-desc"
                placeholder="Brief description of the café..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </Field>
            <Field label="Status" htmlFor="cafe-active">
              <Switch
                id="cafe-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => { onCreate({ name, photoUrl, description, isActive }); setOpen(false); }} disabled={!name || !photoUrl || !description}>
              Add Café
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditCafeDialog({ cafe, onUpdate }: { cafe: Cafe; onUpdate: (id: string, input: UpdateCafeInput) => void }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(cafe.name);
  const [photoUrl, setPhotoUrl] = React.useState(cafe.photoUrl);
  const [description, setDescription] = React.useState(cafe.description);
  const [isActive, setIsActive] = React.useState(cafe.isActive);

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} className="text-muted hover:text-ink">
        <Upload className="size-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Café</DialogTitle>
            <DialogDescription>Update the café details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Field label="Name" htmlFor="edit-cafe-name">
              <Input
                id="edit-cafe-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Photo URL" htmlFor="edit-cafe-photo">
              <Input
                id="edit-cafe-photo"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
              />
            </Field>
            <Field label="Description" htmlFor="edit-cafe-desc">
              <Textarea
                id="edit-cafe-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </Field>
            <Field label="Status" htmlFor="edit-cafe-active">
              <Switch
                id="edit-cafe-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => { onUpdate(cafe.id, { name, photoUrl, description, isActive }); setOpen(false); }} disabled={!name || !photoUrl || !description}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function ConsoleContentManagerPage() {
  const [activeTab, setActiveTab] = React.useState<'hero' | 'collections' | 'cafes'>('hero');

  const tabs = [
    { id: 'hero', label: 'Hero Carousel', icon: Image },
    { id: 'collections', label: 'Featured Collections', icon: Image },
    { id: 'cafes', label: 'Café Collaborations', icon: Image },
  ] as const;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content Manager"
        description="Manage homepage content: hero carousel, featured collections, and café collaborations."
      />

      <div className="flex gap-2 border-b border-line">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`
              flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors
              ${activeTab === tab.id
                ? 'border-bronze text-bronze'
                : 'border-transparent text-muted hover:text-ink'}
            `}
          >
            <tab.icon className="size-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'hero' && <HeroSlidesTab />}
      {activeTab === 'collections' && <FeaturedCollectionsTab />}
      {activeTab === 'cafes' && <CafesTab />}
    </div>
  );
}