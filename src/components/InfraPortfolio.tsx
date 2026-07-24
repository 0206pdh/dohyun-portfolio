import Image from "next/image";
import { profile } from "@/data/profile";

const stack = [
  { label: "AWS / EKS", icon: "/images/icons/aws.svg" },
  { label: "Terraform", icon: "/images/icons/terraform.svg" },
  { label: "Kubernetes", icon: "/images/icons/kubernetes.svg" },
  { label: "Argo CD", icon: "/images/icons/argo.svg" },
  { label: "Prometheus", icon: "/images/icons/prometheus.svg" },
  { label: "Grafana", icon: "/images/icons/grafana.svg" },
  { label: "OpenTelemetry", icon: "/images/icons/opentelemetry.svg" },
  { label: "Helm", icon: "/images/icons/helm.svg" },
];

const responsibilities = [
  "Terraform 공통 모듈과 환경별 스택으로 VPC, EKS, Aurora/RDS, Redis, S3, SQS, IRSA를 코드화",
  "Kustomize base + dev/prod overlay와 Argo CD Application으로 선언적 배포 흐름 구성",
  "API·CPU Worker·GPU Worker·Batch를 Namespace, NodePool, taint/toleration, resource request로 분리",
  "SQS queue depth를 기준으로 KEDA가 Pod를 확장하고, Karpenter가 CPU/GPU NodeClaim을 프로비저닝하도록 연결",
  "Prometheus·Grafana·OpenTelemetry·Phoenix를 연결해 노드, 큐, 워커, trace를 함께 관측",
];

type TroubleshootingItem = { number: string; title: string; problem: string; action: string; result?: string };

const troubleshooting: TroubleshootingItem[] = [
  {
    number: "01", title: "CA + HPA에서 KEDA + Karpenter로 전환",
    problem: "CPU 임계치 기반 HPA는 SQS 적체를 늦게 감지하고, GPU 노드의 최소 용량을 유지해야 해 유휴 비용이 발생했습니다.",
    action: "SQS queue depth를 KEDA trigger로 사용하고, 워크로드별 NodePool과 Karpenter를 연결했습니다. Karpenter는 NodeClaim으로 EC2를 직접 프로비저닝해, 기존 CA의 ASG 확장 방식(약 3~5분) 대비 노드 준비 시간을 약 60초로 단축했습니다.",
  },
  {
    number: "02", title: "GPU 콜드스타트와 SQS 메시지 유실 방지",
    problem: "minReplicaCount=0인 GPU Worker가 EC2 부팅·드라이버 초기화·이미지 pull·모델 로딩을 거치며 첫 요청에 5~10분이 걸렸고, visibility timeout과 겹치면 메시지가 재처리 또는 DLQ로 이동할 수 있었습니다.",
    action: "gpu-inference queue timeout을 600초에서 1800초로 늘리고 maxReceiveCount를 3으로 조정했습니다. EFS에 pyannote·Whisper 모델을 캐싱해 모델 다운로드 단계를 제거했습니다.",
  },
  {
    number: "03", title: "Worker disk-pressure 연쇄 eviction",
    problem: "3~7GB의 ML 이미지를 기본 20GB EBS에서 반복 pull하면서 worker Pod가 Evicted되고, 재생성된 Pod가 다시 이미지를 받는 루프가 발생했습니다.",
    action: "Terraform worker disk를 50GB로 올리고 ephemeral-storage request/limit을 추가했습니다. worker 노드에는 1시간마다 미사용 이미지를 정리하는 image-pruner DaemonSet을 배치했습니다.",
  },
  {
    number: "04", title: "VPC CNI Prefix Delegation과 서브넷 단편화",
    problem: "가용 IP가 112개 남아도 /28 연속 블록을 확보하지 못해 IPAMD가 InsufficientCidr를 반환했고, CPU Worker가 16시간 동안 ContainerCreating에 머물렀습니다.",
    action: "Secondary CIDR와 Pod subnet을 추가하고 VPC CNI Custom Networking 및 ENIConfig를 Terraform으로 구성했습니다. 이후 Pod 네트워크용 SG와 DNS 경로를 별도로 검증했습니다.",
  },
  {
    number: "05", title: "KEDA·Karpenter 운영 경계 정리",
    problem: "KEDA의 scaleOnInFlight, Argo CD selfHeal, Karpenter consolidation이 동시에 동작하면서 GPU Pod flapping과 Terminating 지연이 발생했습니다.",
    action: "cpu-worker의 consolidateAfter를 30초에서 5분으로 늘리고, GPU NodePool은 terminationGracePeriodSeconds보다 충분한 10분 버퍼를 두었습니다. KEDA가 replica를 조정하는 필드는 Argo CD ignoreDifferences로 분리했습니다.",
  },
  {
    number: "06", title: "초기 배포 실패를 재발 방지 가능한 설정으로 전환",
    problem: "IRSA ARN Account ID 누락, probe 경로 불일치, worker __main__ 진입점 누락, S3/DB 환경변수 불일치가 CrashLoopBackOff와 AccessDenied로 흩어져 나타났습니다.",
    action: "AWS Account ID 자동 주입, health endpoint 교정, worker entrypoint 추가, ExternalSecret·IRSA·ConfigMap 기준 통일을 배포 스크립트와 매니페스트에 반영했습니다.",
  },
  {
    number: "07", title: "On-Demand 중심 구조를 Spot·Right-sizing으로 비용 최적화",
    problem: "GPU Worker가 콜드스타트 대응을 위해 최소 용량을 상시 유지하면서 유휴 비용이 발생했고, Batch Worker는 실제 요청 리소스(1 vCPU/2Gi)에 비해 xlarge 인스턴스만 사용해 과다 프로비저닝되고 있었습니다.",
    action: "Karpenter NodePool을 워크로드별로 Spot+On-Demand를 함께 쓰도록 열었습니다(CPU: m5/m5a/m6i/m6a, GPU: g4dn.xlarge/2xlarge, Batch: c5/c6i/c6a/m5/m6i). consolidation 정책도 워크로드 특성에 맞게 나눠 GPU는 terminationGracePeriodSeconds보다 긴 10분, CPU는 모델 재로딩 비용을 감안해 5분으로 설정했습니다. Kubecost와 AWS Cost Explorer로 적용 전후 비용을 비교했습니다.",
    result: "EC2 컴퓨트 일일 비용이 $28.73 → $12.02로 약 58% 줄었고, 같은 기간 인스턴스 사용 시간은 오히려 47% 늘었습니다(g4dn 계열 -$27.16, m5 계열 -93.7%).",
  },
  {
    number: "08", title: "Public 노출 최소화와 워크로드 격리로 방어 계층 추가",
    problem: "EKS API 엔드포인트가 Public으로 열려 있었고, 네임스페이스 간 네트워크가 분리되지 않아 워크로드 하나가 뚫리면 클러스터 전체로 위험이 번질 수 있는 구조였습니다.",
    action: "CloudFront에 AWSManagedRulesCommonRuleSet + IP 기반 RateLimit WAF를 Count 모드로 먼저 붙이고 Block으로 전환했습니다. 인증서 기반 AWS Client VPN으로 클러스터 접근 경로를 별도로 구축하고, EKS API 엔드포인트를 Private로 전환했습니다. 네임스페이스에는 VPC CNI NetworkPolicy로 default-deny 후 ALB→API→AI 서비스 등 필요한 트래픽만 허용했고, 모든 워크로드에 runAsNonRoot·seccompProfile·readOnlyRootFilesystem을 적용했습니다. Promtail과 OTel Collector에는 Authorization·Cookie·토큰을 로그·trace 저장 전에 지우는 redact 처리를 추가했습니다.",
  },
];

const cloudLayers = [
  { title: "Network", detail: "VPC의 Public/Private Subnet과 NAT Gateway로 외부 트래픽과 내부 워크로드를 분리하고, Secondary CIDR·VPC CNI Custom Networking으로 Pod IP 대역을 별도 관리합니다." },
  { title: "Compute", detail: "EKS 위에 API·CPU Worker·GPU Worker·Batch를 NodePool 단위로 나누고, Karpenter가 워크로드 특성에 맞는 노드를 온디맨드로 프로비저닝합니다." },
  { title: "Data", detail: "Aurora/RDS가 정형 데이터를, ElastiCache Redis가 캐시·세션을, S3가 오디오·리포트 파일을 맡아 컴퓨트 계층과 상태를 분리했습니다." },
  { title: "Messaging", detail: "SQS 큐가 API와 Worker 사이를 비동기로 연결해, 분석 요청이 몰려도 API 응답성과 GPU 자원 사용을 독립적으로 조절할 수 있습니다." },
  { title: "Security", detail: "네임스페이스별 IRSA로 IAM 권한을 최소 범위로 나누고, ESO(External Secrets Operator)로 시크릿을 코드베이스에서 분리해 관리합니다. NetworkPolicy default-deny와 runAsNonRoot·readOnlyRootFilesystem으로 워크로드를 격리했습니다. CloudFront WAF와 Client VPN·Private 엔드포인트로 외부 접근 경로를 통제하고, 로그·trace는 저장 전 redact 처리합니다." },
  { title: "Observability", detail: "Prometheus·Grafana·OpenTelemetry·Phoenix를 연결해 노드, 큐, 워커, trace를 하나의 관측 축에서 함께 확인합니다." },
  { title: "Delivery", detail: "Terraform이 VPC부터 EKS·RDS·SQS까지 기반 인프라를, Argo CD + Kustomize overlay가 애플리케이션 배포를 코드화해 dev/prod를 같은 원칙으로 운영합니다." },
];

function CloudArchitectureOverview() {
  return (
    <div className="cloud-architecture-grid">
      {cloudLayers.map((layer) => (
        <div className="cloud-architecture-card" key={layer.title}>
          <h4>{layer.title}</h4>
          <p>{layer.detail}</p>
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <div className="section-title"><span>{eyebrow}</span><h2>{title}</h2></div>;
}

function ArchitectureFigures() {
  return (
    <div className="architecture-figures">
      <figure>
        <figcaption>전체 아키텍처 · AWS / EKS / 데이터·관측성 계층</figcaption>
        <div className="architecture-image overall-architecture">
          <Image src="/images/utterai-architecture.png" alt="UtterAI 전체 AWS 아키텍처" width={3795} height={2500} />
        </div>
      </figure>
      <figure>
        <figcaption>EKS Cluster · VPC, subnet, node provisioning, platform controllers</figcaption>
        <div className="architecture-image">
          <Image src="/images/eks-cluster-architecture.png" alt="UtterAI EKS 클러스터 아키텍처" width={2100} height={1020} />
        </div>
      </figure>
    </div>
  );
}

function TroubleshootingCard({ item }: { item: TroubleshootingItem }) {
  return (
    <article className="troubleshooting-card">
      <div className="troubleshooting-heading"><span className="problem-number">{item.number}</span><h3>{item.title}</h3></div>
      <div className="troubleshooting-copy">
        <p><b>문제</b>{item.problem}</p><p><b>해결</b>{item.action}</p>{item.result && <p><b>결과</b>{item.result}</p>}
      </div>
    </article>
  );
}

export function InfraPortfolio() {
  return (
    <main className="portfolio-shell">
      <header className="portfolio-header">
        <div><p className="portfolio-kicker">CLOUD INFRASTRUCTURE PORTFOLIO</p><h1>DoHyun, Cloud Engineer</h1></div>
        <div className="header-contact"><a href={`mailto:${profile.contact.email}`}>{profile.contact.email}</a><a href={profile.contact.github} target="_blank" rel="noreferrer">GitHub ↗</a></div>
      </header>

      <section className="profile-sheet">
        <div className="profile-intro">
          <Image src={profile.avatarUrl} alt={profile.name} width={72} height={72} className="profile-avatar" priority />
          <div>
            <p className="profile-label">CLOUD ENGINEER</p>
            <h2>{profile.name}</h2>
            <p>{profile.tagline}</p>
          </div>
          <div className="profile-links"><a href={`mailto:${profile.contact.email}`}>{profile.contact.email}</a><a href={profile.contact.github} target="_blank" rel="noreferrer">github.com/0206pdh ↗</a></div>
        </div>
        <div className="profile-details">
          <div><h3>기본 정보</h3><dl><div><dt>생년월일</dt><dd>{profile.birthDate}</dd></div><div><dt>이메일</dt><dd>{profile.contact.email}</dd></div></dl></div>
          <div><h3>학력 · 교육 이수</h3><dl>{profile.education.map((item) => <div key={item.school}><dt>학력</dt><dd>{item.school}{item.degree && ` · ${item.degree}`} ({item.period} · {item.status})</dd></div>)}{profile.training.map((item) => <div key={item.name}><dt>교육</dt><dd>{item.name} ({item.period} · {item.status})</dd></div>)}</dl></div>
          <div><h3>자격증 · 어학</h3><ul className="credential-list">{profile.certificates.map((item) => <li key={item.name}><span>{item.name}</span><small>{item.status} · {item.date}</small></li>)}</ul></div>
          <div><h3>수상이력</h3><ul className="credential-list">{profile.awards.map((award) => <li key={award}><span>{award.replace("최우수상", "")}<strong>최우수상</strong></span></li>)}</ul></div>
        </div>
      </section>

      <section className="project-sheet hero-sheet">
        <div className="project-topline">
          <div><p className="project-label">AWS 13기 최종 프로젝트 · UtterAI</p><h2>AI 기반 언어 재활 임상 치료 보조 SaaS의<br /><em>운영 가능한 인프라</em> 만들기</h2><p className="project-period">진행기간 · 2026.05 — 2026.07</p></div>
          <div className="role-panel"><p>담당 영역</p><strong>Cloud Infra / Kubernetes / Terraform</strong><span>Dev · Prod 환경을 같은 운영 원칙으로 확장</span></div>
        </div>
        <div className="project-summary">
          <div><h3>프로젝트 목적</h3><p>음성 업로드부터 CPU/GPU 분석, 리포트 생성까지 이어지는 비동기 파이프라인을 AWS와 Kubernetes 위에서 안정적으로 운영하기 위한 인프라 저장소입니다. Terraform으로 기반 리소스를 재사용하고, Kustomize와 Argo CD로 환경별 차이를 선언적으로 관리했습니다.</p></div>
        </div>
        <div className="stack-row"><span className="stack-title">기술 스택</span>{stack.map((item) => <span className="stack-chip" key={item.label}><Image src={item.icon} alt="" width={24} height={24} /><span>{item.label}</span></span>)}</div>
      </section>

      <section className="project-sheet">
        <SectionTitle eyebrow="01 · Cloud Architecture" title="EKS를 포함한 전체 클라우드 구조" />
        <p className="architecture-overview-lead">EKS는 여러 계층 중 컴퓨트를 맡는 한 부분입니다. 네트워크·데이터·메시징·보안·관측성·배포까지 7개 계층이 함께 맞물려 하나의 운영 가능한 인프라를 이룹니다.</p>
        <CloudArchitectureOverview />
      </section>

      <section className="project-sheet">
        <SectionTitle eyebrow="02 · Role & Architecture" title="구조를 만들고, 흐름을 검증했습니다" />
        <div className="role-layout"><div><h3 className="subheading">주요업무 및 상세 역할</h3><ul className="check-list">{responsibilities.map((item) => <li key={item}>{item}</li>)}</ul></div><ArchitectureFigures /></div>
      </section>

      <section className="project-sheet troubleshooting-sheet"><SectionTitle eyebrow="03 · Troubleshooting" title="장애를 원인 단위로 쪼개고 재발을 막았습니다" /><div className="troubleshooting-grid">{troubleshooting.map((item) => <TroubleshootingCard key={item.number} item={item} />)}</div></section>
      <footer className="portfolio-footer"><span>DoHyun · Cloud Infrastructure Engineer</span><span>© {new Date().getFullYear()}</span></footer>
    </main>
  );
}
