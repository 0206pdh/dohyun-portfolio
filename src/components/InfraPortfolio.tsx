import { profile } from "@/data/profile";

const stack = [
  "AWS", "Terraform", "EKS", "Kubernetes", "Kustomize", "Argo CD",
  "Karpenter", "KEDA", "SQS", "Prometheus", "Grafana", "OpenTelemetry",
];

const responsibilities = [
  "Terraform 공통 모듈과 환경별 스택으로 VPC, EKS, Aurora/RDS, Redis, S3, SQS, IRSA를 코드화",
  "Kustomize base + dev/prod overlay와 Argo CD Application으로 선언적 배포 흐름 구성",
  "API·CPU Worker·GPU Worker·Batch를 Namespace, NodePool, taint/toleration, resource request로 분리",
  "SQS queue depth를 기준으로 KEDA가 Pod를 확장하고, Karpenter가 CPU/GPU NodeClaim을 프로비저닝하도록 연결",
  "Prometheus·Grafana·OpenTelemetry·Phoenix를 연결해 노드, 큐, 워커, trace를 함께 관측",
];

const metrics = [
  { value: "3.75s", label: "ready_100 p50 단축", detail: "Karpenter 54.126s vs CA 57.879s" },
  { value: "58%", label: "일일 EC2 비용 절감", detail: "$28.73/day → $12.02/day" },
  { value: "3~5분", label: "GPU 콜드스타트", detail: "EFS 모델 캐싱 전 5~10분" },
  { value: "50GB", label: "Worker 디스크 기준", detail: "기본 20GB에서 증설" },
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

function Architecture() {
  return (
    <div className="architecture" aria-label="UtterAI 인프라 흐름">
      <div className="architecture-row">
        <div className="architecture-node external">User</div><div className="architecture-arrow">→</div>
        <div className="architecture-node edge">CloudFront<br />/ ALB</div><div className="architecture-arrow">→</div>
        <div className="architecture-node cluster">EKS API</div>
      </div>
      <div className="architecture-branch">
        <div className="architecture-line" /><div className="architecture-node queue">SQS<br /><small>analysis queue</small></div>
        <div className="architecture-arrow">→</div><div className="architecture-node worker">KEDA<br /><small>Pod 0 ↔ N</small></div>
        <div className="architecture-arrow">→</div><div className="architecture-node nodepool">Karpenter<br /><small>NodeClaim</small></div>
      </div>
      <div className="architecture-services"><span>CPU Worker</span><span>GPU Worker</span><span>Batch Worker</span><span>Aurora · Redis · S3</span></div>
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
        <div><p className="portfolio-kicker">CLOUD INFRASTRUCTURE PORTFOLIO</p><h1>DoHyun, Cloud Infra Portfolio</h1></div>
        <div className="header-contact"><a href={`mailto:${profile.contact.email}`}>{profile.contact.email}</a><a href={profile.contact.github} target="_blank" rel="noreferrer">GitHub ↗</a></div>
      </header>

      <section className="project-sheet hero-sheet">
        <div className="project-topline">
          <div><p className="project-label">AWS 13기 최종 프로젝트 · UtterAI</p><h2>AI 음성 분석 플랫폼의<br /><em>운영 가능한 EKS</em> 만들기</h2><p className="project-period">진행기간 · 2026.05 — 2026.07</p></div>
          <div className="role-panel"><p>담당 영역</p><strong>Cloud Infra / Kubernetes / Terraform</strong><span>Dev · Prod · Tokyo 환경을 같은 운영 원칙으로 확장</span></div>
        </div>
        <div className="project-summary">
          <div><h3>프로젝트 목적</h3><p>음성 업로드부터 CPU/GPU 분석, 리포트 생성까지 이어지는 비동기 파이프라인을 AWS와 Kubernetes 위에서 안정적으로 운영하기 위한 인프라 저장소입니다. Terraform으로 기반 리소스를 재사용하고, Kustomize와 Argo CD로 환경별 차이를 선언적으로 관리했습니다.</p></div>
          <div><h3>얻어간 점</h3><ul><li>Queue-driven autoscaling 설계와 실험</li><li>노드·Pod·애플리케이션 경계를 넘는 장애 분석</li><li>비용과 안정성을 함께 보는 운영 기준</li></ul></div>
        </div>
        <div className="stack-row"><span className="stack-title">기술 스택</span>{stack.map((item) => <span className="stack-chip" key={item}>{item}</span>)}</div>
      </section>

      <section className="project-sheet">
        <SectionTitle eyebrow="01 · Role & Architecture" title="구조를 만들고, 흐름을 검증했습니다" />
        <div className="two-column role-grid"><div><h3 className="subheading">주요업무 및 상세 역할</h3><ul className="check-list">{responsibilities.map((item) => <li key={item}>{item}</li>)}</ul></div><div><h3 className="subheading">서비스 흐름</h3><Architecture /></div></div>
        <div className="principles"><div><b>01</b><span>데이터 플레인</span><p>API·Worker를 workload와 리소스 요구사항에 맞게 분리</p></div><div><b>02</b><span>스케일 플레인</span><p>KEDA는 Pod, Karpenter는 Node를 책임지도록 경계 설정</p></div><div><b>03</b><span>컨트롤 플레인</span><p>Terraform과 Argo CD로 변경을 추적하고 재현</p></div></div>
      </section>

      <section className="project-sheet metric-sheet">
        <SectionTitle eyebrow="02 · Result" title="측정 가능한 결과를 남겼습니다" />
        <div className="metric-grid">{metrics.map((metric) => <div className="metric-card" key={metric.label}><strong>{metric.value}</strong><span>{metric.label}</span><small>{metric.detail}</small></div>)}</div>
        <div className="comparison-note"><div><span className="note-label">Autoscaling experiment</span><h3>9개 replica 부하 · 각 10회</h3><p>ready_100 기준 Karpenter p50 54.126s / p95 69.056s, CA p50 57.879s / p95 68.055s</p></div><div className="bar-comparison" aria-label="ready_100 p50 비교"><div><span>CA + HPA</span><i style={{ width: "82%" }} /><b>57.879s</b></div><div><span>KEDA + Karpenter</span><i style={{ width: "76%" }} /><b>54.126s</b></div></div></div>
        <small className="evidence-line">수치 근거 · `ca_vs_karpenter_fair_comparison.csv`, `utterai-eks.pdf`, 2026-07-06 실험 결과</small>
      </section>

      <section className="project-sheet troubleshooting-sheet"><SectionTitle eyebrow="03 · Troubleshooting" title="장애를 원인 단위로 쪼개고 재발을 막았습니다" /><div className="troubleshooting-grid">{troubleshooting.map((item) => <TroubleshootingCard key={item.number} item={item} />)}</div></section>

      <section className="project-sheet reflection-sheet">
        <SectionTitle eyebrow="04 · Takeaway" title="운영은 설정값보다 경계의 문제였습니다" />
        <div className="reflection-grid"><div className="quote-block"><p>“SQS가 얼마나 쌓였는가”와<br /><em>“노드가 얼마나 빨리 준비되는가”</em>를<br />같은 흐름으로 관측해야 했습니다.</p></div><div className="reflection-copy"><p>이번 프로젝트에서 가장 크게 배운 점은 Kubernetes 리소스 하나의 문제가 실제로는 Terraform state, AWS 네트워크, KEDA trigger, Karpenter lifecycle, 애플리케이션의 SQS 처리 방식까지 이어진다는 사실이었습니다.</p><p>그래서 해결책을 클러스터의 임시 patch로 끝내지 않고, 변수·manifest·runbook·실험 결과로 다시 남겼습니다. 다음 환경에서도 같은 장애를 빠르게 재현하고 설명할 수 있는 인프라를 만드는 것이 목표입니다.</p></div></div>
        <div className="closing-links"><a href="https://github.com/UtterAI-aws13/UtterAI_Infra" target="_blank" rel="noreferrer">UtterAI_Infra GitHub ↗</a><a href={`mailto:${profile.contact.email}`}>함께 이야기하기 ↗</a></div>
      </section>
      <footer className="portfolio-footer"><span>DoHyun · Cloud Infrastructure Engineer</span><span>© {new Date().getFullYear()}</span></footer>
    </main>
  );
}
