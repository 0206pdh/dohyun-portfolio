export type Project = {
  id: string;
  name: string;
  period: string;
  category: string;
  description: string;
  highlights: string[];
  stack: string[];
  link: string;
};

export const projects: Project[] = [
  {
    id: "utterai-infra",
    name: "UtterAI Infra",
    period: "2026.05 - 2026.07",
    category: "Cloud Infra",
    description:
      "AWS EKS 기반 AI 음성 분석 플랫폼의 인프라를 코드로 관리하는 저장소입니다. Terraform으로 VPC, EKS, RDS, Redis, S3, SQS, IRSA 등을 구성하고, Argo CD가 Kustomize overlay(dev/prod)를 추적해 배포합니다.",
    highlights: [
      "Terraform 모듈화로 dev/prod 환경별 리소스 구성 재사용",
      "Kustomize base + overlays 구조와 Argo CD GitOps 배포 파이프라인",
      "kube-prometheus-stack, OpenTelemetry Collector로 클러스터 관측성 확보",
      "CA+HPA / Karpenter+KEDA 부하 테스트 시나리오로 오토스케일링 검증",
    ],
    stack: ["Terraform", "AWS EKS", "Kubernetes", "Argo CD", "Prometheus", "OpenTelemetry"],
    link: "https://github.com/UtterAI-aws13/UtterAI_Infra",
  },
  {
    id: "scalead-k8s",
    name: "autoscaling-advisor (scalead-k8s)",
    period: "2026.04",
    category: "Cloud Infra / CLI",
    description:
      "K8s에 배포하기 전 Helm values 파일이나 매니페스트 디렉토리를 정적으로 분석해 오토스케일링 전략을 추천하는 CLI 도구입니다. 클러스터 접근 없이 로컬에서 실행되어, 실서비스 도입 전 의사결정 후보를 좁히는 데 사용됩니다.",
    highlights: [
      "클러스터 접근 없이 정적 분석만으로 오토스케일링 정책 추천",
      "pip / pipx로 설치 가능한 배포형 CLI 패키지로 제작",
      "rich / json 두 가지 출력 포맷 지원",
    ],
    stack: ["Python", "Kubernetes", "Helm", "CLI"],
    link: "https://github.com/0206pdh/scalead-k8s",
  },
  {
    id: "dockviz-cli",
    name: "dockviz-cli",
    period: "2026.03 - 2026.04",
    category: "Dev Tool / TUI",
    description:
      "Docker 데몬의 컨테이너·네트워크·이미지·이벤트를 하나의 터미널 화면에서 실시간으로 모니터링하고 제어하는 Go 기반 TUI 대시보드입니다. Docker SDK로 데이터를 수집하고 Bubble Tea의 TEA 구조로 화면과 입력을 처리하며, 데모 모드·원격 데몬·단일 바이너리 배포를 지원합니다.",
    highlights: [
      "Containers/Networks/Images/Events 탭과 2초 주기 CPU·MEM·포트·상태 모니터링",
      "네트워크 토폴로지와 컨테이너 lifecycle 이벤트 타임라인으로 장애 전파 시각화",
      "실시간 로그 스트리밍, CPU·MEM 히스토리 차트, 컨테이너 exec, 이미지 pull 진행률 구현",
      "Go 단일 바이너리와 pip·apt·GitHub Releases 기반 멀티 플랫폼 배포 자동화",
    ],
    stack: ["Go", "Docker SDK", "Bubble Tea", "Lip Gloss", "Cobra", "GitHub Actions"],
    link: "https://github.com/0206pdh/dockviz-cli",
  },
  {
    id: "seoulmate-be",
    name: "SeoulMate",
    period: "2026.05",
    category: "Backend / AI",
    description:
      "자연어로 입력한 조건에 맞춰 서울 시내 데이트/외출 코스를 추천하는 서비스의 백엔드입니다. 서울 공공데이터 기반 장소 후보를 LLM이 파싱·스코어링해 실제 방문 가능한 코스를 반환합니다.",
    highlights: [
      "LangGraph로 자연어 조건 파싱부터 코스 추천까지 파이프라인 구성",
      "PostgreSQL(AWS RDS) + Kakao Local/Mobility API 연동",
      "AWS EC2 + Nginx + PM2로 배포 운영",
    ],
    stack: ["TypeScript", "Node.js", "Express", "PostgreSQL", "AWS EC2", "LangGraph"],
    link: "https://github.com/0206pdh/SeoulMate_BE",
  },
  {
    id: "moveradar",
    name: "MoveRadar v2",
    period: "2026.04",
    category: "Data / ML",
    description:
      "이사 수요를 1~2개월 선행 탐지하는 Snowflake Native 인텔리전스 파이프라인으로, Snowflake KR Hackathon 2026 테크 트랙 출품작입니다. 시세·전입인구·통신·카드소비 4개 신호를 이상탐지 모델로 학습해 지역 단위 경보를 생성합니다.",
    highlights: [
      "Snowflake Marketplace 데이터셋 4종을 결합한 전처리·피처 파이프라인 설계",
      "Cortex Anomaly Detection으로 신호별 이상탐지 모델 4종 학습",
      "Cortex COMPLETE(LLM)로 경보 유형별 맞춤 마케팅 문구 자동 생성",
      "Streamlit Native App으로 지도/트렌드/문구 대시보드 구현",
    ],
    stack: ["Snowflake", "Cortex", "Streamlit", "SQL", "Python"],
    link: "https://github.com/0206pdh/MoveRadar",
  },
  {
    id: "algonotion",
    name: "AlgoNotion Extension",
    period: "2026.03",
    category: "Tool",
    description:
      "백준(BOJ)에서 '맞았습니다!!'가 뜨면 자동으로 제출 코드를 수집해 Notion 데이터베이스에 저장해주는 크롬 확장 프로그램입니다.",
    highlights: [
      "Notion API 연동으로 문제 풀이 기록 자동화",
      "Chrome Extension Manifest 기반 페이지 이벤트 감지",
    ],
    stack: ["JavaScript", "Chrome Extension", "Notion API"],
    link: "https://github.com/0206pdh/AlgoNotion_Extention",
  },
];
