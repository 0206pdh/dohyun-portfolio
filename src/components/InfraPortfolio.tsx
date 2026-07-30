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
  "Terraform을 공통 모듈과 환경별 스택으로 나눠, 리소스 정의는 재사용하면서 dev/prod는 변수 값만 다르게 주입되도록 구성",
  "Kustomize base + dev/prod overlay와 Argo CD Application으로 선언적 배포 흐름 구성",
  "API·CPU Worker·GPU Worker·Batch를 Namespace, NodePool, taint/toleration, resource request로 분리",
  "SQS queue depth를 기준으로 KEDA가 Pod를 확장하고, Karpenter가 CPU/GPU NodeClaim을 프로비저닝하도록 연결",
];

type TroubleshootingItem = { number: string; title: string; problem: string; action: string; result?: string };

const troubleshooting: TroubleshootingItem[] = [
  {
    number: "01", title: "CPU 기반 오토스케일링의 구조적 한계를 KEDA + Karpenter로 해결",
    problem: "워커 부하는 SQS 큐 깊이로 결정되는데, 기존 HPA는 CPU 사용률만 관찰했습니다. 음성 파일이 쌓여도 워커가 떠 있지 않으면 CPU는 0%라 HPA는 이를 부하로 인식조차 못 했고, 구조적으로 scale-to-zero도 불가능해 유휴 비용이 큰 GPU Worker에 특히 불리했습니다.",
    action: "audio-preprocess·gpu-inference·report-analysis·rag-ingest 큐마다 KEDA ScaledObject를 두어 SQS 큐 깊이 자체를 스케일 트리거로 사용하도록 바꿨습니다. KEDA는 실행 중인 Pod 없이도 외부 지표(큐 깊이)를 직접 폴링할 수 있어, HPA와 달리 minReplicaCount=0에서 시작해 메시지가 들어오면 0→1로 스케일업하는 구조가 가능합니다. KEDA operator 전용 IRSA(pod identity)로 SQS 조회 권한만 최소로 부여했고, 노드 프로비저닝은 Karpenter로 넘겨 NodePool을 cpu-worker·batch-worker·gpu로 분리했습니다. GPU NodePool은 WhenEmpty 정책으로 처리 중에는 노드를 유지하다가 큐가 비면 10분 뒤 0대까지 내리도록, CPU/Batch는 짧은 주기로 유휴 노드를 정리하도록 나눠 설정했습니다. Karpenter는 ASG/MNG의 launch template·lifecycle hook을 거치지 않고 NodeClaim으로 EC2를 직접 호출하기 때문에, Pending Pod의 리소스 요청만 보고 맞는 인스턴스 타입을 즉시 프로비저닝합니다. 전환 후에는 Grafana 대시보드로 desired/current replica 추이, 노드 생성·회수 이벤트, NodePool별 사용률을 관찰해 큐 적체 시 스케일아웃이 CPU 상태와 무관하게 즉시 따라붙는지, 유휴 노드가 실제로 정리되는지를 확인했습니다.",
    result: "CPU 사용률과 무관하게 큐 깊이만으로 스케일이 걸리도록 바뀌면서, 예전에는 감지조차 못 하던 부하 패턴에도 반응하게 됐고 GPU NodePool을 0대까지 내리는 scale-to-zero가 가능해졌습니다. Pod 스케일 반응은 CPU 임계값을 기다리던 수 분에서 큐 감지 후 30초 이내로, 노드 준비 시간은 CA의 ASG 확장(약 3~5분) 대비 Karpenter 직접 프로비저닝에서 약 60초로 함께 줄었습니다.",
  },
  {
    number: "02", title: "GPU 콜드스타트 5~10분을 3~5분으로 단축",
    problem: "GPU Worker는 minReplicaCount=0이라 첫 요청마다 EC2 부팅부터 모델 로딩까지 5~10분의 콜드스타트가 발생했고, 처리 중 SQS visibility timeout(600초)을 넘기면 메시지가 재수신되거나 DLQ로 빠질 위험이 있었습니다.",
    action: "콜드스타트 구간을 EC2 부팅(1~3분), GPU 드라이버 초기화(30초~1분), ML 이미지 pull(1~2분), pyannote·Whisper 모델 로딩(2~3분)으로 나눠보니 앞의 세 구간은 KEDA·Karpenter가 손댈 수 없는 AWS/OS/컨테이너 레이어였고, 실제로 줄일 수 있는 건 매번 HuggingFace에서 새로 받던 모델 로딩 구간이었습니다. Terraform으로 EFS 파일시스템과 마운트 타깃을 새로 만들고 EFS CSI Driver·StorageClass(efs-ap, ReadWriteMany)·PVC를 구성해 GPU 노드가 여러 개 떠도 같은 모델 캐시를 공유하도록 했습니다. Init Job을 한 번 돌려 pyannote·Whisper 모델을 EFS에 먼저 올려두고, HF_HOME을 /mnt/model-cache로 지정해 pod가 뜰 때 다운로드 없이 캐시에서 바로 로드하도록 바꿨습니다. 메시지 유실 위험은 별도로 gpu-inference 큐의 visibility timeout을 600초에서 1800초로 늘리고 maxReceiveCount를 3으로 조정해, 처리 도중 재수신되거나 DLQ로 직행하지 않도록 했습니다.",
    result: "모델 로딩 구간이 2~3분에서 EFS 캐시 로드 20~40초로 줄면서, 전체 콜드스타트가 5~10분에서 3~5분으로 단축됐습니다. 부팅·드라이버·이미지 pull 구간은 그대로지만, 가장 큰 비중을 차지하던 모델 다운로드 단계를 제거한 효과입니다.",
  },
  {
    number: "03", title: "On-Demand 중심 구조를 Spot·Right-sizing으로 비용 최적화",
    problem: "GPU Worker가 콜드스타트 대응을 위해 최소 용량을 상시 유지해 유휴 비용이 발생했고, Batch Worker는 실제 요청 리소스(1 vCPU/2Gi) 대비 xlarge 인스턴스만 사용해 과다 프로비저닝되고 있었습니다.",
    action: "Karpenter NodePool을 워크로드별로 나눠 CPU(m5/m5a/m6i/m6a)·GPU(g4dn.xlarge/2xlarge)·Batch(c5/c6i/c6a/m5/m6i)에 Spot+On-Demand를 함께 열어 인스턴스 선택 폭을 넓히고, consolidation 정책도 워크로드 특성에 맞게 나눴습니다(GPU는 처리 중 노드가 회수되지 않도록 10분, CPU는 모델 재로딩 비용을 감안해 5분 대기 후 회수). 전환 전후 효과는 감으로 판단하지 않고 Kubecost와 AWS Cost Explorer를 연결한 FinOps 파이프라인으로 EC2 컴퓨트 비용을 인스턴스 패밀리별로 나눠 비교했습니다.",
    result: "EC2 컴퓨트 일일 비용이 $28.73 → $12.02로 약 58% 줄었습니다. 인스턴스 패밀리별로는 GPU 계열이 $45.20 → $18.04(-60%), 고비용이던 m5 계열은 -93.7% 수준으로 거의 제거되고 저렴한 버스터블·Spot 인스턴스로 재배치됐습니다. 같은 기간 인스턴스 사용 시간은 449시간 → 660시간으로 오히려 47% 늘었는데도 총비용은 33.8% 줄어, 사용량이 늘어도 단가 자체가 낮아졌다는 걸 확인했습니다.",
  },
];

const cloudLayers = [
  { title: "Network", detail: "VPC의 Public/Private Subnet과 NAT Gateway로 외부 트래픽과 내부 워크로드를 분리하고, Secondary CIDR·VPC CNI Custom Networking으로 Pod IP 대역을 별도 관리합니다." },
  { title: "Compute", detail: "EKS 위에 API·CPU Worker·GPU Worker·Batch를 NodePool 단위로 나누고, Karpenter가 워크로드 특성에 맞는 노드를 온디맨드로 프로비저닝합니다." },
  { title: "Data", detail: "Aurora/RDS가 정형 데이터를, ElastiCache Redis가 캐시·세션을, S3가 오디오·리포트 파일을 맡아 컴퓨트 계층과 상태를 분리했습니다." },
  { title: "Messaging", detail: "SQS 큐가 API와 Worker 사이를 비동기로 연결해, 분석 요청이 몰려도 API 응답성과 GPU 자원 사용을 독립적으로 조절할 수 있습니다." },
  { title: "Security", detail: "네임스페이스별 IRSA·ESO로 권한과 시크릿을 최소 범위로 분리하고, NetworkPolicy default-deny와 WAF·Private 엔드포인트로 접근 경로를 통제합니다." },
  { title: "Observability", detail: "Prometheus·Grafana·OpenTelemetry·Phoenix를 연결해 노드·큐·워커·trace를 함께 확인하고, 대시보드와 알림으로 스케일링·장애 신호를 조기에 포착합니다." },
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

function FullArchitectureFigure() {
  return (
    <div className="architecture-figures">
      <figure>
        <figcaption>전체 아키텍처 · AWS / EKS / 데이터·관측성 계층</figcaption>
        <div className="architecture-image overall-architecture">
          <Image src="/images/utterai-architecture.png" alt="UtterAI 전체 AWS 아키텍처" width={3795} height={2500} />
        </div>
      </figure>
    </div>
  );
}

function EksClusterFigure() {
  return (
    <div className="architecture-figures">
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

      <section className="project-sheet hero-sheet">
        <div className="project-topline">
          <div><p className="project-label">AWS 13기 최종 프로젝트 · UtterAI</p><h2>AI 기반 언어 재활 임상 치료 보조 SaaS</h2><p className="project-period">진행기간 · 2026.05 — 2026.07</p></div>
          <div className="role-panel"><p>담당 영역</p><strong>Cloud Infra / Kubernetes / Terraform</strong><span>Dev · Prod 환경을 같은 운영 원칙으로 확장</span></div>
        </div>
        <div className="project-summary">
          <div><h3>프로젝트 목적</h3><p>언어치료사는 40분 세션마다 녹음을 다시 들으며 전사하고 발화를 분석해 보고서로 정리하는 데 2시간 이상을 씁니다. 치료 효과를 측정하는 핵심 지표인 언어표본분석조차 52%가 시행되지 못하고, 시행하더라도 90%가 손으로 이뤄집니다. UtterAI는 녹음 업로드만으로 전사·지표 계산·SOAP 노트 초안까지 자동화해 이 부담을 줄이는 서비스입니다.</p></div>
        </div>
        <div className="stack-row"><span className="stack-title">기술 스택</span>{stack.map((item) => <span className="stack-chip" key={item.label}><Image src={item.icon} alt="" width={24} height={24} /><span>{item.label}</span></span>)}</div>
      </section>

      <section className="project-sheet">
        <SectionTitle eyebrow="01 · Cloud Architecture" title="전체 클라우드 아키텍처" />
        <p className="architecture-overview-lead">음성 업로드부터 CPU/GPU 분석, 리포트 생성까지 이어지는 비동기 파이프라인을 안정적으로 운영하기 위해 네트워크·컴퓨트·데이터·메시징·보안·관측성·배포 7개 계층을 독립적으로 설계했습니다. SQS로 계층 사이 결합도를 낮춰 트래픽이 몰려도 각 계층을 따로 확장하고, Terraform·Kustomize·Argo CD로 dev·prod 환경을 같은 코드 기반에서 재현할 수 있게 했습니다.</p>
        <FullArchitectureFigure />
        <CloudArchitectureOverview />
      </section>

      <section className="project-sheet">
        <SectionTitle eyebrow="02 · Role & Architecture" title="구조를 만들고, 흐름을 검증했습니다" />
        <div className="role-layout"><div><h3 className="subheading">주요업무 및 상세 역할</h3><ul className="check-list">{responsibilities.map((item) => <li key={item}>{item}</li>)}</ul></div><EksClusterFigure /></div>
      </section>

      <section className="project-sheet troubleshooting-sheet"><SectionTitle eyebrow="03 · Key Improvements" title="숫자로 증명한 핵심 개선 3가지" /><div className="troubleshooting-grid">{troubleshooting.map((item) => <TroubleshootingCard key={item.number} item={item} />)}</div></section>
      <footer className="portfolio-footer"><span>DoHyun · Cloud Infrastructure Engineer</span><span>© {new Date().getFullYear()}</span></footer>
    </main>
  );
}
