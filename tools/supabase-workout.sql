-- Athlete Quest (Workoutapp) — Google hesabına bağlı bulut kayıt.
-- Supabase projesi LGSMert ile ortak (veufvthlejqoobexzrjo); tablolar workout_* önekiyle ayrı.
-- Doğrudan tablo erişimi yok (RLS açık, politika yok); her şey oturum açmış kullanıcının
-- kendi e-postasıyla çalışan SECURITY DEFINER fonksiyonlardan geçer.

create table if not exists public.workout_profiles (
  id bigserial primary key,
  email text not null unique check (email = lower(email)),
  auth_user_id uuid unique,
  display_name text,
  history jsonb not null default '[]'::jsonb,     -- [{id, date, dayId, dayName, type, xp, setsDone, setsTotal, sets:[{ex,s,r}]}]
  records jsonb not null default '{}'::jsonb,     -- { taskKey: reps | null }  (son yapılan tekrar; null = silinmiş)
  records_t jsonb not null default '{}'::jsonb,   -- { taskKey: ms }  (anahtar başına son değişiklik zamanı)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sync_at timestamptz
);

-- Değişiklikten önceki hâlin yedeği (kopyalama/geri yükleme gibi toplu işlemlerde)
create table if not exists public.workout_backups (
  id bigserial primary key,
  profile_id bigint,
  email text,
  reason text,
  history jsonb,
  records jsonb,
  records_t jsonb,
  created_at timestamptz not null default now()
);

-- Bir kerelik kopyalama: kaynak hesap ilk kez veri gönderince hedefe birleştirilir
create table if not exists public.workout_seeds (
  id bigserial primary key,
  source_email text not null,
  target_email text not null,
  done_at timestamptz,
  note text,
  unique (source_email, target_email)
);

alter table public.workout_profiles enable row level security;
alter table public.workout_backups enable row level security;
alter table public.workout_seeds enable row level security;
revoke all on public.workout_profiles, public.workout_backups, public.workout_seeds from anon, authenticated;
revoke all on sequence public.workout_profiles_id_seq, public.workout_backups_id_seq, public.workout_seeds_id_seq from anon, authenticated;

-- Geçmiş birleştirme: id'ye göre birleşim; aynı id'de daha çok set yapılmış kayıt kalır. Hiçbir kayıt silinmez.
create or replace function public.workout_merge_history(a jsonb, b jsonb)
returns jsonb language sql immutable set search_path = public as $$
  with allx as (
    select e, ord from (
      select e, 0 as ord from jsonb_array_elements(coalesce(a, '[]'::jsonb)) e
      union all
      select e, 1 from jsonb_array_elements(coalesce(b, '[]'::jsonb)) e
    ) u
    where jsonb_typeof(e) = 'object'
      and jsonb_typeof(e->'id') = 'number'
      and jsonb_typeof(e->'date') = 'string'
      and jsonb_typeof(e->'sets') = 'array'
      and jsonb_typeof(e->'xp') = 'number'
      and (e->>'xp')::numeric between 0 and 550
  ), best as (
    select distinct on ((e->>'id')::numeric) e
    from allx
    order by (e->>'id')::numeric, coalesce((e->>'setsDone')::numeric, 0) desc, ord
  )
  select coalesce(jsonb_agg(e order by (e->>'date'), (e->>'id')::numeric), '[]'::jsonb) from best;
$$;

-- Rekor birleştirme (anahtar başına son yazan kazanır). prefer_a=true ise a'da olan anahtar hep kalır.
create or replace function public.workout_merge_records(ra jsonb, ta jsonb, rb jsonb, tb jsonb, prefer_a boolean default false)
returns jsonb language plpgsql immutable set search_path = public as $$
declare k text; out_r jsonb := '{}'::jsonb; out_t jsonb := '{}'::jsonb; va jsonb; vb jsonb; xa numeric; xb numeric;
begin
  ra := coalesce(ra, '{}'::jsonb); rb := coalesce(rb, '{}'::jsonb);
  ta := coalesce(ta, '{}'::jsonb); tb := coalesce(tb, '{}'::jsonb);
  for k in select jsonb_object_keys(ra) union select jsonb_object_keys(rb) loop
    if length(k) > 40 then continue; end if;
    va := ra->k; vb := rb->k;
    xa := case when jsonb_typeof(ta->k) = 'number' then (ta->>k)::numeric else 0 end;
    xb := case when jsonb_typeof(tb->k) = 'number' then (tb->>k)::numeric else 0 end;
    if va is not null and (vb is null or prefer_a or xa >= xb) then
      if jsonb_typeof(va) = 'null' or (jsonb_typeof(va) = 'number' and (va::text)::numeric between 0 and 999) then
        out_r := out_r || jsonb_build_object(k, va); out_t := out_t || jsonb_build_object(k, xa); continue;
      end if;
    end if;
    if vb is not null and (jsonb_typeof(vb) = 'null' or (jsonb_typeof(vb) = 'number' and (vb::text)::numeric between 0 and 999)) then
      out_r := out_r || jsonb_build_object(k, vb); out_t := out_t || jsonb_build_object(k, xb);
    end if;
  end loop;
  return jsonb_build_object('r', out_r, 't', out_t);
end $$;

-- Oturum açmış kullanıcının profilini bul / e-postayla önceden bağlananı bağla / yoksa oluştur
create or replace function public.workout_me()
returns public.workout_profiles language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); em text := lower(coalesce(auth.jwt()->>'email', '')); p public.workout_profiles;
begin
  if uid is null or em = '' then raise exception 'not_authenticated'; end if;
  select * into p from workout_profiles where auth_user_id = uid;
  if found then
    if p.email <> em and not exists (select 1 from workout_profiles where email = em) then
      update workout_profiles set email = em where id = p.id returning * into p;
    end if;
    return p;
  end if;
  select * into p from workout_profiles where email = em for update;
  if found then
    if p.auth_user_id is null then
      update workout_profiles set auth_user_id = uid where id = p.id returning * into p;
    end if;
    return p;
  end if;
  insert into workout_profiles (email, auth_user_id) values (em, uid) returning * into p;
  return p;
end $$;

-- Ana eşitleme: cihazdaki veriyi buluttakiyle birleştirir (ilerleme hiç düşmez), birleşmiş hâli döndürür.
create or replace function public.workout_sync(p_history jsonb default '[]'::jsonb, p_records jsonb default '{}'::jsonb, p_records_t jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.workout_profiles; t public.workout_profiles; s record; mr jsonb; h jsonb; seeded text[] := '{}';
begin
  if octet_length(coalesce(p_history, '[]')::text) > 3000000 or octet_length(coalesce(p_records, '{}')::text) > 200000 then
    raise exception 'payload_too_large';
  end if;
  if jsonb_typeof(coalesce(p_history, '[]')) <> 'array' then p_history := '[]'; end if;
  if jsonb_typeof(coalesce(p_records, '{}')) <> 'object' then p_records := '{}'; end if;
  if jsonb_typeof(coalesce(p_records_t, '{}')) <> 'object' then p_records_t := '{}'; end if;
  p := workout_me();
  select * into p from workout_profiles where id = p.id for update;
  h := workout_merge_history(p.history, p_history);
  mr := workout_merge_records(p.records, p.records_t, p_records, p_records_t, false);
  update workout_profiles set history = h, records = mr->'r', records_t = mr->'t',
    updated_at = case when h is distinct from p.history or (mr->'r') is distinct from p.records then now() else updated_at end,
    last_sync_at = now()
  where id = p.id returning * into p;

  -- Bir kerelik kopya (ör. kardeşin profiline): kaynakta antrenman varsa hedefe birleştir.
  -- Hedefin kendi kayıtları korunur (geçmiş birleşir, aynı rekor anahtarında hedefinki kalır).
  for s in select * from workout_seeds where source_email = p.email and done_at is null for update loop
    if jsonb_array_length(p.history) = 0 then exit; end if;
    select * into t from workout_profiles where email = lower(s.target_email) for update;
    if not found then
      insert into workout_profiles (email) values (lower(s.target_email)) returning * into t;
    end if;
    insert into workout_backups (profile_id, email, reason, history, records, records_t)
      values (t.id, t.email, 'seed-before:' || p.email, t.history, t.records, t.records_t);
    mr := workout_merge_records(t.records, t.records_t, p.records, p.records_t, true);
    update workout_profiles set history = workout_merge_history(t.history, p.history),
      records = mr->'r', records_t = mr->'t', updated_at = now()
    where id = t.id;
    update workout_seeds set done_at = now() where id = s.id;
    seeded := seeded || t.email;
  end loop;

  return jsonb_build_object('email', p.email, 'name', p.display_name, 'history', p.history,
    'records', p.records, 'records_t', p.records_t, 'updated_at', p.updated_at, 'seeded', to_jsonb(seeded));
end $$;

revoke all on function public.workout_merge_history(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.workout_merge_records(jsonb, jsonb, jsonb, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.workout_me() from public, anon, authenticated;
revoke all on function public.workout_sync(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.workout_sync(jsonb, jsonb, jsonb) to authenticated;

-- Ön bağlı profiller (ilk Google girişinde e-postayla eşleşir)
insert into public.workout_profiles (email, display_name) values
  ('merterenkarakose@gmail.com', 'Mert Eren'),
  ('m.emrekarakose55@gmail.com', 'Melih Emre')
on conflict (email) do nothing;

-- Melih'in verisi ilk geldiğinde bir kez Mert'in profiline de kopyalanır (2026-11-06 isteği)
insert into public.workout_seeds (source_email, target_email, note) values
  ('m.emrekarakose55@gmail.com', 'merterenkarakose@gmail.com', 'Kardeşin sıfırlanan istatistikleri: şimdilik Melih ile aynı olsun')
on conflict do nothing;
