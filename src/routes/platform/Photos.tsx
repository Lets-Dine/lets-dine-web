import { useMemo, useState } from 'react';
import { addLibraryPhoto, getLibrarySignature, listLibrary, removeLibraryPhoto, updateLibraryGroup } from '../../api/dishPhotos';
import type { LibraryPhoto } from '../../api/dishPhotos';
import { ImageUpload } from '../../components/admin/ImageUpload';
import { ADMIN_GHOST, ADMIN_PRIMARY, ADMIN_TINY, Empty, Field, INPUT_BOX, Loading, PageTitle, Panel, TextInput, useCommand } from '../../components/admin/kit';
import { Check, Search, X } from '../../components/icons';
import { cx } from '../../components/ui';
import { useAsync } from '../../state/useAsync';
import { usePageTitle } from '../../state/usePageTitle';

/**
 * The shared photo library restaurants pick from while adding a dish. Photos are
 * grouped by the dish they show, because that is how a restaurant will look for
 * them — and how the operator thinks: "Momo has two, Noodles has two."
 *
 * Adding is two moves: name the dish, upload. The name stays after an upload, so
 * a second photo of the same dish is one more click rather than a second form.
 */
export function PlatformPhotos() {
  usePageTitle('Dish photos · Platform admin');
  const library = useAsync(listLibrary, []);
  const { busy, run } = useCommand();
  const [name, setName] = useState('');
  const [tagText, setTagText] = useState('');
  const [link, setLink] = useState('');
  const [filter, setFilter] = useState('');

  const photos = library.data;
  const groups = useMemo(() => {
    const byName = new Map<string, { name: string; tags: string[]; photos: LibraryPhoto[] }>();
    for (const photo of photos ?? []) {
      const key = photo.name.trim().toLowerCase();
      const group = byName.get(key) ?? { name: photo.name.trim(), tags: [], photos: [] };
      group.photos.push(photo);
      for (const tag of photo.tags) if (!group.tags.includes(tag)) group.tags.push(tag);
      byName.set(key, group);
    }
    const q = filter.trim().toLowerCase();
    return [...byName.values()].filter((g) => `${g.name} ${g.tags.join(' ')}`.toLowerCase().includes(q));
  }, [photos, filter]);

  if (!photos) {
    if (library.error)
      return (
        <Panel>
          <Empty
            title="Could not load the photo library"
            message={library.error.message}
            action={
              <button type="button" className={ADMIN_GHOST} onClick={library.reload}>
                Try again
              </button>
            }
          />
        </Panel>
      );
    return <Loading label="Loading photos…" />;
  }

  const add = (dishName: string, url: string, tags: string[]) =>
    run('add', () => addLibraryPhoto(dishName, url, tags), `Added to ${dishName.trim()}`).then((ok) => {
      if (ok) library.reload();
      return ok;
    });
  /** The top form is one photo per fill: a saved photo clears it, so the next dish starts blank. */
  const addFromForm = (url: string) =>
    void add(name, url, typedTags).then((ok) => {
      if (!ok) return;
      setName('');
      setTagText('');
      setLink('');
    });
  const saveGroup = (from: string, nextName: string, tags: string[]) =>
    run('group', () => updateLibraryGroup(from, nextName, tags), `${nextName.trim()} updated`).then((ok) => {
      if (ok) library.reload();
      return ok;
    });
  const remove = (photo: LibraryPhoto) =>
    void run(photo.id, () => removeLibraryPhoto(photo.id), 'Photo removed').then((ok) => ok && library.reload());

  const typedTags = tagText.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  const hasName = name.trim().length > 0;
  const linkOk = /^https?:\/\/\S+$/i.test(link.trim());
  const knownNames = [...new Set(photos.map((p) => p.name.trim()))];

  return (
    <>
      <PageTitle
        title="Dish photos"
        subtitle="Restaurants see these as suggestions when they add or edit a dish with a matching name."
      />

      <Panel title="Add a photo" hint="Name the dish, then upload a photo or paste a link. More photos for a dish you already have go on its row below.">
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-3">
            <Field label="Dish name" className="min-w-44 flex-1">
              <TextInput value={name} onChange={setName} maxLength={60} placeholder="Momo" list="photo-dish-names" />
            </Field>
            <Field label="Also known as" className="min-w-44 flex-1">
              <TextInput value={tagText} onChange={setTagText} maxLength={120} placeholder="dumpling, steamed" />
            </Field>
            <datalist id="photo-dish-names">
              {knownNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <ImageUpload
              target="dish"
              aspect={1}
              label="Upload photo"
              signer={getLibrarySignature}
              disabled={!hasName || busy}
              onUploaded={addFromForm}
            />
            <span className="pb-2.5 text-[12.5px] text-ink-4">or</span>
            <form
              className="flex min-w-60 flex-1 items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (hasName && linkOk) addFromForm(link.trim());
              }}
            >
              <Field label="Image link" className="flex-1">
                <TextInput value={link} onChange={setLink} placeholder="https://…" />
              </Field>
              <button type="submit" className={ADMIN_GHOST} disabled={!hasName || !linkOk || busy}>
                Add link
              </button>
            </form>
          </div>
        </div>
        <p className="mt-4 text-[12.5px] text-ink-4">
          Matching is by word: a photo named “Momo” is suggested for “Chicken Momo”, and one tagged “dumpling” for “Pork Dumpling” too.
        </p>
      </Panel>

      <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight">
          Library <span className="ml-1 font-normal text-ink-3 tnum">{photos.length}</span>
        </h2>
        {photos.length > 6 && (
          <label className="relative block w-full sm:w-64">
            <span className="sr-only">Filter by dish name</span>
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-4" />
            <input
              className={cx(INPUT_BOX, 'h-10 py-0 pl-10')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by dish"
            />
          </label>
        )}
      </div>

      <Panel bare>
        {photos.length === 0 ? (
          <Empty
            title="No photos yet"
            message="Add a photo above and it shows up as a suggestion for every restaurant with a matching dish."
          />
        ) : groups.length === 0 ? (
          <Empty title={`No dish matches “${filter.trim()}”`} message="Check the spelling, or add it above." />
        ) : (
          groups.map((group) => (
            <section key={group.name} className="grid gap-3 border-b border-hairline px-4 py-4 last:border-0 sm:grid-cols-[10rem_1fr] sm:px-5">
              <GroupHeader group={group} busy={busy} onSave={saveGroup} />
              <ul className="flex flex-wrap gap-3">
                {group.photos.map((photo) => (
                  <li key={photo.id}>
                    <Tile photo={photo} disabled={busy} onRemove={() => remove(photo)} />
                  </li>
                ))}
                <li>
                  <ImageUpload
                    target="dish"
                    aspect={1}
                    signer={getLibrarySignature}
                    disabled={busy}
                    label="Add"
                    className="size-24! flex-col gap-1 rounded-xl! border border-dashed border-hairline-strong bg-transparent! px-0! text-ink-3 ring-0! hover:text-ink"
                    onUploaded={(url) => add(group.name, url, group.tags)}
                  />
                </li>
              </ul>
            </section>
          ))
        )}
      </Panel>
    </>
  );
}

/** One photo. Removing asks first, right on the tile, so a stray click never deletes something restaurants rely on. */
function Tile({ photo, disabled, onRemove }: { photo: LibraryPhoto; disabled: boolean; onRemove: () => void }) {
  const [asking, setAsking] = useState(false);
  return (
    <div className="group relative size-24 overflow-hidden rounded-xl bg-surface-2 ring-1 ring-hairline ring-inset" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setAsking(false)}>
      <img src={photo.imageUrl} alt={`${photo.name} photo`} loading="lazy" className="size-full object-cover" />
      {asking ? (
        <div className="absolute inset-0 grid place-content-center justify-items-center gap-1.5 bg-ink/70 p-1.5 text-bg">
          <span className="text-[12px] font-semibold">Remove it?</span>
          <div className="flex gap-1">
            <button type="button" aria-label="Keep photo" className={cx(ADMIN_TINY, 'size-8 justify-center bg-bg/20 px-0')} onClick={() => setAsking(false)} autoFocus>
              <X size={14} />
            </button>
            <button type="button" aria-label="Remove photo" disabled={disabled} className={cx(ADMIN_TINY, 'size-8 justify-center bg-berry px-0 text-white')} onClick={onRemove}>
              <Check size={14} />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          aria-label={`Remove ${photo.name} photo`}
          className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-ink/70 text-bg opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
          onClick={() => setAsking(true)}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/** A dish's name and other names. Editing happens in place and spans the row, since two fields don't fit the 10rem label column. */
function GroupHeader({
  group,
  busy,
  onSave,
}: {
  group: { name: string; tags: string[]; photos: LibraryPhoto[] };
  busy: boolean;
  onSave: (from: string, name: string, tags: string[]) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [tagText, setTagText] = useState(group.tags.join(', '));

  if (!editing)
    return (
      <div>
        <h3 className="text-[14.5px] font-semibold tracking-tight">{group.name}</h3>
        <p className="mt-0.5 text-[12.5px] text-ink-3 tnum">
          {group.photos.length} {group.photos.length === 1 ? 'photo' : 'photos'}
        </p>
        {group.tags.length > 0 && <p className="mt-1 text-[12.5px] text-ink-4">{group.tags.join(' · ')}</p>}
        <button
          type="button"
          className={cx(ADMIN_TINY, '-ml-2.5 mt-1 text-ink-3 hover:text-ink')}
          onClick={() => {
            setName(group.name);
            setTagText(group.tags.join(', '));
            setEditing(true);
          }}
        >
          Edit
        </button>
      </div>
    );

  const tags = tagText.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  const save = () => void onSave(group.name, name, tags).then((ok) => ok && setEditing(false));

  return (
    <form
      className="flex flex-wrap items-end gap-3 sm:col-span-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) save();
      }}
    >
      <Field label="Dish name" className="min-w-44 flex-1">
        <TextInput value={name} onChange={setName} maxLength={60} autoFocus />
      </Field>
      <Field label="Also known as" className="min-w-44 flex-1">
        <TextInput value={tagText} onChange={setTagText} maxLength={120} placeholder="dumpling, steamed" />
      </Field>
      <div className="flex gap-2">
        <button type="button" className={ADMIN_GHOST} disabled={busy} onClick={() => setEditing(false)}>
          Cancel
        </button>
        <button type="submit" className={ADMIN_PRIMARY} disabled={busy || !name.trim()}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
