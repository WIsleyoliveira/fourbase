-- Cor personalizada (escolhida no seletor de espectro do cadastro de membro
-- e de cliente). Nullable — quando ausente, o app usa a cor automática
-- (hash determinístico por id, ver src/colors.js).

alter table fourbase_users   add column if not exists color text;
alter table fourbase_clients add column if not exists color text;
