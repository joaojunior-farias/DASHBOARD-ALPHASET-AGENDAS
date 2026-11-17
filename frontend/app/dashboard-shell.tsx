"use client";

import { Archive, CalendarDays, Link2, Menu, Plus, Settings, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiRequest, Dialog, LogoutButton, TeamMark, useSubmit } from "./agenda-ui";

type WorkStatus = { id: string; name: string; color: string | null };
type Profile = { name: string; avatar: string | null; role: "master" | "operator"; statuses: WorkStatus[] };
type Area = "team" | "closed" | "calendar" | "settings" | "users" | "clients";

export function DashboardShell({ area, statusId, statuses, createCard, showAgendaLink, children }: {
  area: Area; statusId?: string; statuses?: WorkStatus[]; createCard?: () => void; showAgendaLink?: () => void; children: React.ReactNode;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    let active = true;
    void apiRequest<Profile>(undefined, "/api/perfil").then((data) => { if (active) setProfile(data); }).catch(() => {});
    return () => { active = false; };
  }, []);

  async function saveProfile(name: FormDataEntryValue | null, avatar: string | null) {
    const saved = await apiRequest<Pick<Profile, "name" | "avatar">>({ name, avatar }, "/api/perfil");
    setProfile((current) => current && { ...current, ...saved });
    setEditing(false);
  }

  const statusLinks = statuses ?? profile?.statuses ?? [];
  return (
    <div className="dashboard-shell">
      <header className="dashboard-topbar" aria-label="Conta do dashboard">
        <button className="dashboard-profile" aria-label="Editar meu perfil" disabled={!profile} onClick={() => setEditing(true)}>
          <Avatar name={profile?.name ?? "Perfil"} avatar={profile?.avatar ?? null} />
          <span>{profile?.name ?? "Perfil"}</span>
        </button>
        <LogoutButton />
      </header>
      <aside className="dashboard-sidebar">
        <div className="dashboard-sidebar-heading">
          <TeamMark />
          <button className="button outline dashboard-menu-toggle" aria-expanded={menuOpen} aria-controls="dashboard-navigation"
            onClick={() => setMenuOpen(!menuOpen)}><Menu size={18} /> Menu</button>
        </div>
        <nav className={menuOpen ? "dashboard-nav open" : "dashboard-nav"} id="dashboard-navigation" aria-label="Menu do dashboard">
          <h2>Gestão da equipe</h2>
          <Link href="/" aria-current={area === "team" ? "page" : undefined}><Users size={17} /> Cards da equipe</Link>
          {createCard ? <button onClick={() => { setMenuOpen(false); createCard(); }}><Plus size={17} /> Novo card</button>
            : <Link href="/?novo=1"><Plus size={17} /> Novo card</Link>}
          <Link href="/?encerrados=1" aria-current={area === "closed" ? "page" : undefined}><Archive size={17} /> Eventos encerrados</Link>
          {showAgendaLink ? <button onClick={() => { setMenuOpen(false); showAgendaLink(); }}><Link2 size={17} /> Link da agenda</button>
            : <Link href="/?link=1"><Link2 size={17} /> Link da agenda</Link>}

          <h2>Gestão de trabalho</h2>
          <Link href="/calendario" aria-current={area === "calendar" && !statusId ? "page" : undefined}><CalendarDays size={17} /> Calendário</Link>
          <details open={Boolean(statusId)}>
            <summary>Eventos por status</summary>
            {statusLinks.map((status) => <Link key={status.id} href={`/calendario?status=${status.id}`} aria-current={area === "calendar" && statusId === status.id ? "page" : undefined}>
              <span className="dashboard-status-dot" data-color={status.color} />{status.name}
            </Link>)}
          </details>
          <Link href="/clientes" aria-current={area === "clients" ? "page" : undefined}><Users size={17} /> Clientes</Link>
          <Link href="/calendario?configuracoes=1" aria-current={area === "settings" ? "page" : undefined}><Settings size={17} /> Configurações</Link>
          {profile?.role === "master" && <Link href="/usuarios" aria-current={area === "users" ? "page" : undefined}><Users size={17} /> Usuários</Link>}
        </nav>
      </aside>
      <div className="dashboard-body">{children}</div>
      {editing && profile && <Dialog close={() => setEditing(false)}><ProfileForm profile={profile} save={saveProfile} /></Dialog>}
    </div>
  );
}

function Avatar({ name, avatar }: { name: string; avatar: string | null }) {
  const initials = name.trim().split(/\s+/u).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  return <span className="dashboard-avatar" aria-hidden="true">{avatar ? <img alt="" src={avatar} /> : initials}</span>;
}

function ProfileForm({ profile, save }: { profile: Profile; save: (name: FormDataEntryValue | null, avatar: string | null) => Promise<void> }) {
  const [avatar, setAvatar] = useState(profile.avatar);
  const [imageError, setImageError] = useState("");
  const [loadingImage, setLoadingImage] = useState(false);
  const { busy, error, submit } = useSubmit();

  async function loadImage(file: File | undefined) {
    if (!file) return;
    setLoadingImage(true);
    setImageError("");
    try {
      if (file.size > 10_000_000) throw new Error("Arquivo grande");
      const source = await createImageBitmap(file);
      try {
        const size = Math.min(source.width, source.height);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 128;
        const context = canvas.getContext("2d");
        if (!context || !size) throw new Error("Imagem indisponível");
        context.drawImage(source, (source.width - size) / 2, (source.height - size) / 2, size, size, 0, 0, 128, 128);
        const jpeg = canvas.toDataURL("image/jpeg", .8);
        if (!jpeg.startsWith("data:image/jpeg;base64,")) throw new Error("Formato indisponível");
        setAvatar(jpeg);
      } finally { source.close(); }
    } catch {
      setImageError("Escolha uma foto válida de até 10 MB.");
    } finally { setLoadingImage(false); }
  }

  return <form method="post" onSubmit={(event) => void submit(event, (fields) => save(fields.get("name"), avatar))}>
    <h2 id="dialog-title">Meu perfil</h2>
    <div className="form-fields">
      <label>Nome de exibição<input name="name" defaultValue={profile.name} required minLength={2} maxLength={80} /></label>
      <label>Foto de perfil<input type="file" accept="image/*" disabled={loadingImage || busy}
        onChange={(event) => void loadImage(event.currentTarget.files?.[0])} /></label>
      {avatar && <div className="profile-preview"><Avatar name={profile.name} avatar={avatar} /><button className="button outline" type="button" onClick={() => setAvatar(null)}>Remover foto</button></div>}
    </div>
    {(error || imageError) && <p className="form-error" role="alert">{error || imageError}</p>}
    <div className="dialog-actions"><button className="button primary" disabled={busy || loadingImage}>Salvar perfil</button></div>
  </form>;
}
