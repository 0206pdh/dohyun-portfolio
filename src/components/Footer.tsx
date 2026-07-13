import { profile } from "@/data/profile";

export function Footer() {
  return (
    <footer className="border-t border-slate-100">
      <div className="mx-auto max-w-4xl px-6 py-8 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} {profile.name}. Built with Next.js & Tailwind CSS.
      </div>
    </footer>
  );
}
