import { DEFAULT_FRAME, GALLERY_CATEGORY_LABELS, type ArtworkWithArtist } from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart, Frame } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PanelHeader } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/display';
import { Photo } from '@/components/ui/photo';
import { FrameConfigurator } from '@/features/public/components/FrameConfigurator';
import { useCart } from '@/contexts/CartContext';
import { errorMessage } from '@/lib/api';
import { qk } from '@/lib/query';
import { catalogService } from '@/services/catalog.service';
import { cn } from '@/lib/utils';

export default function WishlistPage() {
  const queryClient = useQueryClient();
  const cart = useCart();
  const [configuring, setConfiguring] = React.useState<ArtworkWithArtist | null>(null);

  const { data = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.wishlist,
    queryFn: () => catalogService.wishlist(),
  });

  const remove = useMutation({
    mutationFn: (artworkId: string) => catalogService.toggleWishlist(artworkId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.wishlist });
      toast.success('Removed from your wishlist');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const addAll = () => {
    for (const artwork of data) cart.add(artwork, DEFAULT_FRAME);
    toast.success(`${data.length} photographs added to your cart`, {
      description: 'Adjust frames and quantities in the cart.',
    });
  };

  return (
    <div>
      <PanelHeader
        icon={Heart}
        title="Wishlist"
        description="Your saved artworks."
        actions={
          data.length > 0 ? (
            <>
              <Button variant="outline" onClick={addAll}>
                Add all to cart
              </Button>
              <Button asChild>
                <Link to="/space/cart">
                  <Frame /> Cart ({cart.count})
                </Link>
              </Button>
            </>
          ) : undefined
        }
      />

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="aspect-[3/4]" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          icon={<Heart />}
          title="Nothing saved yet."
          description="Tap the heart on any photograph to keep it here while you decide."
          action={
            <Button asChild>
              <Link to="/space/collections">Browse art</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-5">
          {data.map((artwork) => (
            <article key={artwork.id} className="group">
              <Link to={`/gallery/${artwork.id}`} className="block">
                <Photo
                  src={artwork.thumbnailUrl || artwork.imageUrl}
                  alt={artwork.title}
                  ratio="aspect-[3/4]"
                  className="photo-edge"
                  imgClassName="transition-transform duration-700 ease-[var(--ease-out-soft)] group-hover:scale-[1.04]"
                />
              </Link>

              <p className="mt-3 truncate font-display text-[0.9375rem] text-ink">{artwork.title}</p>
              <p className="text-xs text-subtle">
                {GALLERY_CATEGORY_LABELS[artwork.category] ?? artwork.category}
              </p>

              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => remove.mutate(artwork.id)}
                  aria-label={`Remove ${artwork.title} from your wishlist`}
                  className="text-bronze transition-opacity hover:opacity-60"
                >
                  <Heart className="size-4 fill-current" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfiguring(artwork)}
                  className={cn(
                    'text-xs text-muted underline-offset-4 transition-colors hover:text-ink hover:underline',
                    'opacity-0 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100',
                  )}
                >
                  Add to frame
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {configuring && (
        <FrameConfigurator
          artwork={configuring}
          open
          onOpenChange={(open) => !open && setConfiguring(null)}
          onConfirm={(frame, quantity) => {
            cart.add(configuring, frame);
            setConfiguring(null);
            toast.success(`${configuring.title} added to your cart`);
          }}
        />
      )}
    </div>
  );
}
