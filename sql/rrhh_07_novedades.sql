-- =====================================================================
-- RRHH · paso 7 · novedades para Delta (etapa 2 de Fichadas)
-- Proyecto Supabase: wcpkpwxhqdcdljfwzcmy. Correr A MANO en el SQL Editor, DESPUÉS de rrhh_06_fichadas.sql.
--
-- Qué hace
--   · Guarda los renglones de novedades que RRHH carga (justificaciones, licencias, vacaciones, adelantos y descuentos) en el formato de Delta:
--     fecha, legajo, código de novedad, cantidad, valor y observaciones. De ahí sale el Excel que se importa en Delta.
--   · Marca cuándo y quién exportó cada renglón, para no importarlo dos veces.
--   · Las horas extra NO pasan por acá (las calcula Delta desde las fichadas depuradas).
--   · «valor» puede tener un importe (adelantos, descuentos): queda protegido igual que el resto de RRHH. NO guarda C.U.I.L., teléfono ni correo.
--
-- Acceso: solo usuarios autenticados, con la compuerta de la sección «liquidacion» de RRHH (rrhh_puede_ver / rrhh_puede_editar). anon no tiene acceso.
-- Reversible: drop table public.rrhh_novedades;
-- =====================================================================
create table if not exists public.rrhh_novedades (
  id            uuid primary key default gen_random_uuid(),
  fecha         date not null,
  legajo        integer not null check (legajo > 0),
  codigo        text not null check (codigo = upper(btrim(codigo)) and length(codigo) between 1 and 30),
  cantidad      numeric not null default 0 check (cantidad >= 0),
  valor         numeric not null default 0 check (valor >= 0),
  observaciones text check (observaciones is null or length(observaciones) <= 200),
  origen        text not null default 'manual' check (origen in ('manual', 'fichadas')),
  creado_por    uuid default auth.uid(),
  creado_en     timestamptz not null default now(),
  exportado_en  timestamptz,
  exportado_por uuid,
  check (cantidad > 0 or valor > 0)
);
create index if not exists rrhh_novedades_fecha_idx on public.rrhh_novedades (fecha, legajo);
create index if not exists rrhh_novedades_pend_idx on public.rrhh_novedades (exportado_en) where exportado_en is null;

alter table public.rrhh_novedades enable row level security;
drop policy if exists rrhh_novedades_sel on public.rrhh_novedades;
drop policy if exists rrhh_novedades_ins on public.rrhh_novedades;
drop policy if exists rrhh_novedades_upd on public.rrhh_novedades;
drop policy if exists rrhh_novedades_del on public.rrhh_novedades;
create policy rrhh_novedades_sel on public.rrhh_novedades for select to authenticated using (public.rrhh_puede_ver('liquidacion'));
create policy rrhh_novedades_ins on public.rrhh_novedades for insert to authenticated with check (public.rrhh_puede_editar('liquidacion'));
create policy rrhh_novedades_upd on public.rrhh_novedades for update to authenticated using (public.rrhh_puede_editar('liquidacion')) with check (public.rrhh_puede_editar('liquidacion'));
-- Borrar solo lo que todavía no se exportó (lo exportado queda como rastro).
create policy rrhh_novedades_del on public.rrhh_novedades for delete to authenticated using (public.rrhh_puede_editar('liquidacion') and exportado_en is null);
revoke all on public.rrhh_novedades from anon;
grant select, insert, update, delete on public.rrhh_novedades to authenticated;
