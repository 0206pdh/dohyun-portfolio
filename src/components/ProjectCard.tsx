import type { Project } from "@/data/projects";

export function ProjectCard({ project }: { project: Project }) {
  return (
    <article className="rounded-2xl border border-slate-200 p-6 transition-shadow hover:shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-lg font-semibold text-slate-900">{project.name}</h3>
        <span className="text-xs text-slate-400">{project.period}</span>
      </div>
      <p className="mt-1 text-xs font-medium text-sky-600">{project.category}</p>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        {project.description}
      </p>
      <ul className="mt-4 space-y-1.5">
        {project.highlights.map((h) => (
          <li key={h} className="flex gap-2 text-sm text-slate-600">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-300" />
            <span>{h}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        {project.stack.map((s) => (
          <span
            key={s}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
          >
            {s}
          </span>
        ))}
      </div>
      <a
        href={project.link}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-sky-600 hover:text-sky-700"
      >
        GitHub에서 보기
        <span aria-hidden>→</span>
      </a>
    </article>
  );
}
