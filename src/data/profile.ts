export const profile = {
  name: "Dohyun Park",
  title: "Cloud Engineer",
  tagline: "인프라 구성 비용과 운영 최적화를 함께 고민하는 클라우드 엔지니어입니다.",
  bio: "Terraform으로 인프라를 코드로 관리하고, 구성 비용과 운영 효율을 함께 최적화하는 클라우드 엔지니어입니다. 자동확장, 관측성, IaC 자동화를 직접 설계하고 운영하며 장애 원인을 기록 가능한 개선안으로 바꾸고 있습니다.",
  birthDate: "2000.02.06",
  avatarUrl: "/images/profile.svg",
  contact: {
    email: "0206pdh@naver.com",
    github: "https://github.com/0206pdh",
  },
  education: [
    {
      school: "중산고등학교",
      degree: "",
      status: "졸업",
      period: "2015.03 - 2018.02",
    },
    {
      school: "광운대학교",
      degree: "컴퓨터정보공학부",
      status: "졸업",
      period: "2020.03 - 2026.02",
    },
  ],
  training: [
    {
      name: "AWS Cloud School",
      status: "수료",
      period: "2025.12 - 2026.07",
    },
  ],
  awards: [
    "한국전파진흥협회 · AWS Korea 주관 최종 프로젝트 최우수상",
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
