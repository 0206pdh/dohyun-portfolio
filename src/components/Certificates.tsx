import { profile } from "@/data/profile";
import { SectionHeading } from "@/components/SectionHeading";

export function Certificates() {
  return (
    <section id="certificates" className="border-t border-slate-100 bg-slate-50/60">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <SectionHeading eyebrow="Certificates" title="자격증" />
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {profile.certificates.map((cert) => (
            <li
              key={cert.name}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-4"
            >
              <div>
                <p className="text-sm font-medium text-slate-900">{cert.name}</p>
                <p className="text-xs text-slate-400">{cert.issuer}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-sky-600">{cert.status}</p>
                <p className="text-xs text-slate-400">{cert.date}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
