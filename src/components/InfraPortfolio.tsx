import Image from "next/image";
import { profile } from "@/data/profile";

const stack = [
  "AWS · EKS", "Terraform", "Kubernetes", "Karpenter · KEDA",
  "Argo CD", "Prometheus · Grafana",
];

const responsibilities = [
  "Terraform 공통 모듈과 환경별 스택으로 VPC, EKS, Aurora/RDS, Redis, S3, SQS, IRSA를 코드화",
  "Kustomize base + dev/prod overlay와 Argo CD Application으로 선언적 배포 흐름 구성",
  "API·CPU Worker·GPU Worker·Batch를 Namespace, NodePool, taint/toleration, resource request로 분리",
  "SQS queue depth를 기준으로 KEDA가 Pod를 확장하고, Karpenter가 CPU/GPU NodeClaim을 프로비저닝하도록 연결",
  "Prometheus·Grafana·OpenTelemetry·Phoenix를 연결해 노드, 큐, 워커, trace를 함께 관측",
];

const troubleshooting = [
  {
    number: "01", title: "CA + HPA에서 KEDA + Karpenter로 전환",
    problem: "CPU 임계치 기반 HPA는 SQS 적체를 늦게 감지하고, GPU 노드의 최소 용량을 유지해야 해 유휴 비용이 발생했습니다.",
    action: "SQS queue depth를 KEDA trigger로 사용하고, 워크로드별 NodePool과 Karpenter를 연결했습니다. 부하 테스트는 9개 replica, CA 10회와 Karpenter 10회로 비교했습니다.",
    result: "ready_100 p50 57.879s → 54.126s로 3.753초 단축. 비용은 하루 $28.73에서 $12.02로 58% 낮아졌고, 사용 시간은 47% 늘었지만 비용은 33.8% 감소했습니다.",
    source: "tests/observe/results · utterai-eks.pdf",
  },
  {
    number: "02", title: "GPU 콜드스타트와 SQS 메시지 유실 방지",
    problem: "minReplicaCount=0인 GPU Worker가 EC2 부팅·드라이버 초기화·이미지 pull·모델 로딩을 거치며 첫 요청에 5~10분이 걸렸고, visibility timeout과 겹치면 메시지가 재처리 또는 DLQ로 이동할 수 있었습니다.",
    action: "gpu-inference queue timeout을 600초에서 1800초로 늘리고 maxReceiveCount를 3으로 조정했습니다. EFS에 pyannote·Whisper 모델을 캐싱해 모델 다운로드 단계를 제거했습니다.",
    result: "문서화된 콜드스타트 구간을 5~10분에서 3~5분으로 줄였습니다. 처리 중에는 ChangeMessageVisibility heartbeat를 적용해야 한다는 운영 기준도 함께 정리했습니다.",
    source: "docs/dev/troubleshooting/2026-06-18.md",
  },
  {
    number: "03", title: "Worker disk-pressure 연쇄 eviction",
    problem: "3~7GB의 ML 이미지를 기본 20GB EBS에서 반복 pull하면서 worker Pod가 Evicted되고, 재생성된 Pod가 다시 이미지를 받는 루프가 발생했습니다.",
    action: "Terraform worker disk를 50GB로 올리고 ephemeral-storage request/limit을 추가했습니다. worker 노드에는 1시간마다 미사용 이미지를 정리하는 image-pruner DaemonSet을 배치했습니다.",
    result: "노드 단위 저장공간과 Pod 단위 임시 저장공간을 함께 제한해 원인을 분리했습니다. GPU AMI에서 disk_size가 무시되는 사실은 Launch Template 기반 설정으로 재검증했습니다.",
    source: "docs/dev/troubleshooting/2026-06-12.md",
  },
  {
    number: "04", title: "VPC CNI Prefix Delegation과 서브넷 단편화",
    problem: "가용 IP가 112개 남아도 /28 연속 블록을 확보하지 못해 IPAMD가 InsufficientCidr를 반환했고, CPU Worker가 16시간 동안 ContainerCreating에 머물렀습니다.",
    action: "Secondary CIDR와 Pod subnet을 추가하고 VPC CNI Custom Networking 및 ENIConfig를 Terraform으로 구성했습니다. 이후 Pod 네트워크용 SG와 DNS 경로를 별도로 검증했습니다.",
    result: "단순한 IP 개수 부족이 아니라 연속 블록·ENI·보안그룹이 함께 만드는 문제임을 진단했습니다. ‘kubectl describe → IPAMD log → AWS 네트워크 리소스’ 순서의 런북으로 남겼습니다.",
    source: "docs/dev/troubleshooting/2026-06-20.md",
  },
  {
    number: "05", title: "KEDA·Karpenter 운영 경계 정리",
    problem: "KEDA의 scaleOnInFlight, Argo CD selfHeal, Karpenter consolidation이 동시에 동작하면서 GPU Pod flapping과 Terminating 지연이 발생했습니다.",
    action: "cpu-worker의 consolidateAfter를 30초에서 5분으로 늘리고, GPU NodePool은 terminationGracePeriodSeconds보다 충분한 10분 버퍼를 두었습니다. KEDA가 replica를 조정하는 필드는 Argo CD ignoreDifferences로 분리했습니다.",
    result: "메시지 처리 중 조기 eviction을 피하고, Pod 스케일 조정 주체를 명확히 했습니다. GPU 노드가 작업 종료 후 0대로 수렴하는 비용 최적화도 유지했습니다.",
    source: "docs/dev/troubleshooting/2026-06-18.md + 2026-06-19.md",
  },
  {
    number: "06", title: "초기 배포 실패를 재발 방지 가능한 설정으로 전환",
    problem: "IRSA ARN Account ID 누락, probe 경로 불일치, worker __main__ 진입점 누락, S3/DB 환경변수 불일치가 CrashLoopBackOff와 AccessDenied로 흩어져 나타났습니다.",
    action: "AWS Account ID 자동 주입, health endpoint 교정, worker entrypoint 추가, ExternalSecret·IRSA·ConfigMap 기준 통일을 배포 스크립트와 매니페스트에 반영했습니다.",
    result: "증상을 Pod 상태만으로 판단하지 않고 ServiceAccount annotation, 컨테이너 credential, 실제 endpoint, SecretSynced 상태를 단계별로 확인하는 진단 흐름을 만들었습니다.",
    source: "docs/dev/troubleshooting/2026-06-12.md + 2026-06-13.md",
  },
];

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <div className="section-title"><span>{eyebrow}</span><h2>{title}</h2></div>;
}

function ArchitectureFigures() {
  return (
    <div className="architecture-figures">
      <figure>
        <figcaption>전체 아키텍처 · AWS / EKS / 데이터·관측성 계층</figcaption>
        <div className="architecture-image overall-architecture">
          <Image src="/images/utterai-architecture.png" alt="UtterAI 전체 AWS 아키텍처" width={1210} height={830} />
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

function TroubleshootingCard({ item }: { item: (typeof troubleshooting)[number] }) {
  return (
    <article className="troubleshooting-card">
      <div className="troubleshooting-heading"><span className="problem-number">{item.number}</span><h3>{item.title}</h3></div>
      <div className="troubleshooting-copy">
        <p><b>문제</b>{item.problem}</p><p><b>해결</b>{item.action}</p><p className="result"><b>결과</b>{item.result}</p>
      </div>
      <small className="source">근거 · {item.source}</small>
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
          <div><h3>수상이력</h3><ul className="credential-list">{profile.awards.map((award) => <li key={award}><span>{award}</span></li>)}</ul></div>
        </div>
      </section>

      <section className="project-sheet hero-sheet">
        <div className="project-topline">
          <div><p className="project-label">AWS 13기 최종 프로젝트 · UtterAI</p><h2>AI 기반 언어 재활 임상 치료 보조 SaaS의<br /><em>운영 가능한 인프라</em> 만들기</h2><p className="project-period">진행기간 · 2026.05 — 2026.07</p></div>
          <div className="role-panel"><p>담당 영역</p><strong>Cloud Infra / Kubernetes / Terraform</strong><span>Dev · Prod 환경을 같은 운영 원칙으로 확장</span></div>
        </div>
        <div className="project-summary">
          <div><h3>프로젝트 목적</h3><p>음성 업로드부터 CPU/GPU 분석, 리포트 생성까지 이어지는 비동기 파이프라인을 AWS와 Kubernetes 위에서 안정적으로 운영하기 위한 인프라 저장소입니다. Terraform으로 기반 리소스를 재사용하고, Kustomize와 Argo CD로 환경별 차이를 선언적으로 관리했습니다.</p></div>
          <div><h3>얻어간 점</h3><ul><li>Queue-driven autoscaling 설계와 실험</li><li>노드·Pod·애플리케이션 경계를 넘는 장애 분석</li><li>비용과 안정성을 함께 보는 운영 기준</li></ul></div>
        </div>
        <div className="stack-row"><span className="stack-title">기술 스택</span>{stack.map((item) => <span className="stack-chip" key={item}>{item}</span>)}</div>
      </section>

      <section className="project-sheet">
        <SectionTitle eyebrow="01 · Role & Architecture" title="구조를 만들고, 흐름을 검증했습니다" />
        <div className="role-layout"><div><h3 className="subheading">주요업무 및 상세 역할</h3><ul className="check-list">{responsibilities.map((item) => <li key={item}>{item}</li>)}</ul></div><ArchitectureFigures /></div>
      </section>

      <section className="project-sheet troubleshooting-sheet"><SectionTitle eyebrow="02 · Troubleshooting" title="장애를 원인 단위로 쪼개고 재발을 막았습니다" /><div className="troubleshooting-grid">{troubleshooting.map((item) => <TroubleshootingCard key={item.number} item={item} />)}</div></section>
      <footer className="portfolio-footer"><span>DoHyun · Cloud Infrastructure Engineer</span><span>© {new Date().getFullYear()}</span></footer>
    </main>
  );
}
