export const profile = {
  name: "DoHyun",
  title: "Cloud Engineer",
  tagline: "AWS와 Kubernetes 위에서 안정적으로 돌아가는 인프라를 만듭니다.",
  bio: "Terraform으로 인프라를 코드로 관리하고, EKS 위에서 서비스를 운영하는 것에 관심이 많은 클라우드 엔지니어 지망생입니다. 오토스케일링, 관측성(Observability), IaC 자동화를 직접 만들어보며 실전 감각을 쌓고 있습니다.",
  birthDate: "2000.02.06",
  avatarUrl: "/images/profile.svg",
  contact: {
    email: "0206pdh@naver.com",
    github: "https://github.com/0206pdh",
  },
  education: [
    {
      school: "광운대학교",
      degree: "컴퓨터정보공학부",
      status: "졸업",
    },
  ],
  training: [
    {
      name: "AWS Cloud School",
      status: "수료",
    },
  ],
  certificates: [
    {
      name: "정보처리기사",
      issuer: "한국산업인력공단",
      status: "합격",
      date: "2025.09",
    },
    {
      name: "데이터분석 준전문가(ADsP)",
      issuer: "한국데이터산업진흥원",
      status: "합격",
      date: "2026.03",
    },
    {
      name: "SQL개발자(SQLD)",
      issuer: "한국데이터산업진흥원",
      status: "합격",
      date: "2026.03",
    },
    {
      name: "OPIc (영어)",
      issuer: "ACTFL",
      status: "Intermediate Mid 2",
      date: "2025.10",
    },
  ],
  skills: {
    "Cloud & Infra": ["AWS (EKS, EC2, RDS, S3, SQS, IAM/IRSA)", "Terraform", "Docker"],
    Orchestration: ["Kubernetes", "Kustomize", "Argo CD", "Helm"],
    Observability: ["Prometheus", "OpenTelemetry", "Grafana"],
    "Language & Backend": ["Python", "Go", "TypeScript / Node.js", "Express"],
    Data: ["PostgreSQL", "Snowflake"],
  },
} as const;
