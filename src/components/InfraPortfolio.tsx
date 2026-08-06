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

type CodeSnippet = { caption: string; content: string };
type TroubleshootingItem = { number: string; title: string; problem: string; action: string; result?: string; code?: CodeSnippet };

const troubleshooting: TroubleshootingItem[] = [
  {
    number: "01", title: "CPU 기반 오토스케일링의 구조적 한계를 KEDA + Karpenter로 해결",
    problem: "워커 부하는 SQS 큐 깊이로 결정되는데, 기존 HPA는 CPU 사용률만 관찰했습니다. 음성 파일이 쌓여도 워커가 떠 있지 않으면 **CPU는 0%**라 HPA는 이를 부하로 인식조차 못 했고, 구조적으로 **scale-to-zero도 불가능**해 유휴 비용이 큰 GPU Worker에 특히 불리했습니다.",
    action: "audio-preprocess·gpu-inference·report-analysis·rag-ingest 큐마다 KEDA ScaledObject를 두어 SQS 큐 깊이 자체를 스케일 트리거로 사용하도록 바꿨습니다. KEDA는 실행 중인 Pod 없이도 외부 지표(큐 깊이)를 직접 폴링할 수 있어, HPA와 달리 **minReplicaCount=0**에서 시작해 메시지가 들어오면 **0→1로 스케일업**하는 구조가 가능합니다.\n\nKEDA operator 전용 IRSA(pod identity)로 SQS 조회 권한만 최소로 부여했고, 노드 프로비저닝은 Karpenter로 넘겨 NodePool을 cpu-worker·batch-worker·gpu로 분리했습니다. GPU NodePool은 **WhenEmpty** 정책으로 처리 중에는 노드를 유지하다가 큐가 비면 **10분 뒤 0대까지** 내리도록, CPU/Batch는 짧은 주기로 유휴 노드를 정리하도록 나눠 설정했습니다.\n\nKarpenter는 ASG/MNG의 launch template·lifecycle hook을 거치지 않고 **NodeClaim으로 EC2를 직접 호출**하기 때문에, Pending Pod의 리소스 요청만 보고 맞는 인스턴스 타입을 즉시 프로비저닝합니다. 전환 후에는 Grafana 대시보드로 desired/current replica 추이, 노드 생성·회수 이벤트, NodePool별 사용률을 관찰해 큐 적체 시 스케일아웃이 CPU 상태와 무관하게 즉시 따라붙는지, 유휴 노드가 실제로 정리되는지를 확인했습니다.",
    result: "CPU 사용률과 무관하게 큐 깊이만으로 스케일이 걸리도록 바뀌면서, 예전에는 감지조차 못 하던 부하 패턴에도 반응하게 됐고 GPU NodePool을 0대까지 내리는 **scale-to-zero**가 가능해졌습니다.\n\nPod 스케일 반응은 CPU 임계값을 기다리던 수 분에서 큐 감지 후 **30초 이내**로, 노드 준비 시간은 CA의 ASG 확장(약 3~5분) 대비 Karpenter 직접 프로비저닝에서 **약 60초**로 함께 줄었습니다.",
  },
  {
    number: "02", title: "GPU 콜드스타트 5~10분을 3~5분으로 단축",
    problem: "GPU Worker는 minReplicaCount=0이라 첫 요청마다 EC2 부팅부터 모델 로딩까지 **5~10분**의 콜드스타트가 발생했고, 처리 중 SQS visibility timeout(600초)을 넘기면 메시지가 재수신되거나 **DLQ로 빠질 위험**이 있었습니다.",
    action: "콜드스타트 구간을 EC2 부팅(1~3분), GPU 드라이버 초기화(30초~1분), ML 이미지 pull(1~2분), pyannote·Whisper 모델 로딩(2~3분)으로 나눠보니 앞의 세 구간은 KEDA·Karpenter가 손댈 수 없는 AWS/OS/컨테이너 레이어였고, 실제로 줄일 수 있는 건 매번 HuggingFace에서 새로 받던 **모델 로딩 구간**이었습니다.\n\nTerraform으로 EFS 파일시스템과 마운트 타깃을 새로 만들고 EFS CSI Driver·StorageClass(efs-ap, ReadWriteMany)·PVC를 구성해 GPU 노드가 여러 개 떠도 같은 모델 캐시를 공유하도록 했습니다. Init Job을 한 번 돌려 pyannote·Whisper 모델을 EFS에 먼저 올려두고, **HF_HOME을 /mnt/model-cache로 지정**해 pod가 뜰 때 다운로드 없이 캐시에서 바로 로드하도록 바꿨습니다.\n\n메시지 유실 위험은 별도로 gpu-inference 큐의 visibility timeout을 **600초에서 1800초**로 늘리고 maxReceiveCount를 3으로 조정해, 처리 도중 재수신되거나 DLQ로 직행하지 않도록 했습니다.",
    result: "모델 로딩 구간이 2~3분에서 EFS 캐시 로드 **20~40초**로 줄면서, 전체 콜드스타트가 **5~10분에서 3~5분**으로 단축됐습니다. 부팅·드라이버·이미지 pull 구간은 그대로지만, 가장 큰 비중을 차지하던 **모델 다운로드 단계를 제거**한 효과입니다.",
  },
  {
    number: "03", title: "On-Demand 중심 구조를 Spot·Right-sizing으로 비용 최적화",
    problem: "GPU Worker가 콜드스타트 대응을 위해 최소 용량을 상시 유지해 **유휴 비용**이 발생했고, Batch Worker는 실제 요청 리소스(1 vCPU/2Gi) 대비 xlarge 인스턴스만 사용해 **과다 프로비저닝**되고 있었습니다.",
    action: "Karpenter NodePool을 워크로드별로 나눠 CPU(m5/m5a/m6i/m6a)·GPU(g4dn.xlarge/2xlarge)·Batch(c5/c6i/c6a/m5/m6i)에 **Spot+On-Demand**를 함께 열어 인스턴스 선택 폭을 넓히고, consolidation 정책도 워크로드 특성에 맞게 나눴습니다(GPU는 처리 중 노드가 회수되지 않도록 10분, CPU는 모델 재로딩 비용을 감안해 5분 대기 후 회수).\n\n전환 전후 효과는 감으로 판단하지 않고 **Kubecost와 AWS Cost Explorer**를 연결한 FinOps 파이프라인으로 EC2 컴퓨트 비용을 인스턴스 패밀리별로 나눠 비교했습니다.",
    result: "EC2 컴퓨트 일일 비용이 **$28.73 → $12.02**로 **약 58%** 줄었습니다. 인스턴스 패밀리별로는 GPU 계열이 **$45.20 → $18.04(-60%)**, 고비용이던 m5 계열은 **-93.7%** 수준으로 거의 제거되고 저렴한 버스터블·Spot 인스턴스로 재배치됐습니다.\n\n같은 기간 인스턴스 사용 시간은 **449시간 → 660시간**으로 오히려 **47%** 늘었는데도 총비용은 **33.8%** 줄어, 사용량이 늘어도 단가 자체가 낮아졌다는 걸 확인했습니다.",
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

const dockvizStack = [
  { label: "Go", icon: "/images/icons/go.svg" },
  { label: "Docker SDK", icon: "/images/icons/docker.svg" },
  { label: "Bubble Tea", icon: "/images/icons/bubbletea.svg" },
  { label: "Cobra", icon: "/images/icons/cobra.svg" },
  { label: "GitHub Actions", icon: "/images/icons/github-actions.svg" },
];

const dockvizPillars = [
  { title: "CLI Entry", detail: "Cobra 기반 CLI가 --demo·--host·--version 플래그를 받아, 데몬 연결 여부와 무관하게 같은 진입점에서 동작을 분기합니다." },
  { title: "Client Interface", detail: "실제 Docker SDK 클라이언트와 데모 클라이언트가 동일한 DockerClient 인터페이스를 구현해, 데몬 없이도 TUI 전체를 개발·검증할 수 있습니다." },
  { title: "TUI Runtime", detail: "Bubble Tea의 Model-Update-View 구조로 Containers·Images·Problems·Disk Usage 4개 화면의 상태 전이와 렌더링을 분리했습니다." },
  { title: "Problems Engine", detail: "Docker 이벤트 스트림과 최근 CPU/MEM 이력을 결합해 OOM·재시작 루프·메모리 증가 등 신호를 심각도(Info/Warning/Critical)별로 분류합니다." },
  { title: "Disk Usage Engine", detail: "system/df API와 Windows Docker Desktop VHDX 로컬 측정을 함께 읽어, Docker가 회수 가능하다고 보는 공간과 host 디스크에 남은 공간을 분리해서 보여줍니다." },
  { title: "Compose Context", detail: "compose-go로 compose 파일을 파싱해 서비스 의존관계·네트워크·볼륨을 라이브 데몬 데이터 위에 읽기 전용으로 겹쳐, 변경 전 영향 범위를 보여줍니다." },
  { title: "Distribution", detail: "GitHub Actions가 linux·windows·darwin × amd64·arm64 6개 조합으로 크로스컴파일한 바이너리를 PyPI wheel·Debian 패키지·GitHub Releases로 함께 배포합니다." },
  { title: "Concurrency", detail: "오픈소스인 Bubble Tea가 제공하는 비동기 tea.Cmd 모델을 그대로 활용해, 컨테이너·이미지 조회와 컨테이너별 CPU/MEM stats 조회를 goroutine으로 병렬 실행합니다. 비용이 큰 system/df 호출은 Disk Usage 탭이 열려 있을 때만 실행되도록 제한해 기본 새로고침 주기의 부담을 줄였습니다." },
];

const dockvizResponsibilities = [
  "Docker SDK 클라이언트와 데모 클라이언트를 하나의 인터페이스로 묶어, 데몬 없이도 전체 TUI를 개발·검증할 수 있는 구조로 설계",
  "Bubble Tea로 Containers·Images·Problems·Disk Usage 4개 화면의 상태 전이를 구현하고, CPU/MEM 히스토리 차트와 실시간 로그 스트리밍을 연결",
  "Docker 이벤트와 리소스 이력을 결합해 문제 신호를 심각도별로 분류하는 Problems 엔진을 설계·구현",
  "system/df와 Windows VHDX 로컬 측정을 결합한 Disk Usage 엔진을 구현하고, 실제 daemon에 fixture를 만들어 회수 검증을 진행",
  "오픈소스 Bubble Tea의 비동기 커맨드 모델과 Go goroutine으로 컨테이너·이미지·stats 조회를 병렬화하고, 비용이 큰 system/df 호출은 필요한 탭에서만 실행되도록 제한",
  "Go 크로스컴파일 → PyPI/Debian/GitHub Releases로 이어지는 배포 파이프라인을 GitHub Actions로 구축",
  "약 5,600줄 규모의 Go 코드베이스는 TECHNICAL.ko.md 스펙 문서를 기준으로 계획·구현·검증을 반복하는 AI 보조 개발 사이클(AI-DLC)로 진행",
];

const dockvizTroubleshooting: TroubleshootingItem[] = [
  {
    number: "01", title: "Local Volumes가 회수되지 않던 문제, 그리고 회수돼도 Windows 디스크는 그대로였던 문제",
    problem: "Disk Usage 패널이 Local Volumes에서 reclaimable 용량을 보여줘도 실제 prune 결과는 **0B로 끝나는** 경우가 있었고, Docker 쪽에서 정상적으로 회수되더라도 Windows Docker Desktop(WSL2)에서는 **C: 드라이브 여유 공간이 바로 돌아오지 않는** 경우가 있어, 두 증상 모두 prune 결과를 신뢰하기 어렵게 만들었습니다.",
    action: "첫 번째 원인은 Docker API 자체의 기본 동작 변화였습니다. PruneVolumes()가 필터 없이 VolumesPrune을 호출하고 있었는데, **Docker API 1.42부터는** 필터 없는 volume prune 요청을 daemon이 자동으로 anonymous(레이블 없는 익명) volume에만 국한시킵니다(moby의 volume/service/convert.go에서 all=true가 없으면 AnonymousLabel 필터를 강제로 추가). 반면 실무에서 reclaimable로 잡히는 볼륨 대부분은 컨테이너가 삭제된 뒤 남은 **named volume**이라 이 필터에 걸려 한 번도 지워지지 않고 있었습니다. **filters.Arg(\"all\", \"true\")**를 명시적으로 전달하도록 고쳐 패널이 보여주는 대상과 실제로 삭제되는 대상을 일치시켰습니다.\n\n두 번째 원인은 Docker 객체 삭제와 Windows host의 VHDX(docker_data.vhdx) 파일 크기 축소가 서로 다른 과정이라는 데 있었습니다. Docker daemon 안에서는 공간이 회수돼도 **WSL2 VHDX는 compact 전까지** Windows 쪽에 그대로 할당돼 있어, Disk Usage 패널에 Docker reclaimable과는 완전히 분리된 읽기 전용 **Host Storage** 섹션을 추가해 VHDX 실제 크기를 로컬에서 직접 측정해 보여주고, docker system df 기준으로는 설명되지 않는 초과분을 'prune 대상이 아니라 진단용 gap'으로 명확히 구분했습니다. dockviz가 VHDX를 자동으로 compact하지는 않도록 했는데, Docker Desktop/WSL 상태와 관리자 권한에 따라 위험도가 있어 **read-only 진단**과 안내만 하는 편이 맞다고 판단했기 때문입니다.",
    result: "--all 없이 prune했을 때는 daemon이 **'Total reclaimed space: 0B'** 를 반환하며 두 volume이 그대로 남았고, --all을 명시하자 두 volume 합계 **8.59GB(4.295GB × 2)** 가 정확히 회수됐습니다.\n\n하지만 이 8.59GB를 정리한 직후에도 host 여유 공간은 **13.520GB → 13.512GB**로 사실상 회복되지 않았고, docker_data.vhdx는 **9.375GB**를 그대로 차지하고 있었습니다. Docker daemon이 '지워졌다'고 답해도 Windows는 그 공간을 아직 못 돌려받는다는 걸 같은 검증에서 함께 확인한 셈입니다.",
  },
  {
    number: "02", title: "컨테이너가 늘어날수록 느려지던 새로고침을 오픈소스 조합으로 계층별 해결",
    problem: "TUI 한 번의 새로고침은 컨테이너·이미지 목록, 컨테이너별 CPU/MEM stats, 문제 신호 계산까지 여러 Docker daemon 조회를 조합해야 하는데, 초기 구현은 컨테이너별 stats를 **순서대로(sequential)** 조회해 컨테이너 수가 늘수록 새로고침 전체가 그만큼 느려졌습니다.",
    action: "이 병목을 하나의 트릭이 아니라 오픈소스별로 역할을 나눠 계층적으로 해결했습니다. 가장 아래층에는 **Docker Go SDK**(github.com/docker/docker)를 두어, docker ps·docker stats 같은 CLI를 매번 새 프로세스로 띄워 텍스트를 파싱하는 대신 daemon API를 typed 객체로 직접 호출하도록 했습니다(internal/docker/*).\n\n그 위에서 오픈소스인 **Bubble Tea**(charmbracelet/bubbletea)의 tea.Cmd 모델을 그대로 활용해, 무거운 Docker 조회를 TUI 렌더링 루프 밖에서 실행하고 결과만 메시지로 되돌려 화면이 멈추지 않게 했습니다.\n\n실제 체감 속도를 만든 부분은 그 안에서 **Go goroutine + sync.WaitGroup + Mutex**로 컨테이너별 FetchStats 호출을 병렬화한 것입니다(internal/tui/model.go의 fetchDataCmd) — 순차 방식은 모든 컨테이너의 API 호출 시간이 그대로 누적되지만, 병렬 방식은 가장 느린 호출 하나의 시간에 수렴합니다.\n\n비용이 큰 system/df 조회(fetchDiskUsageCmd)는 병렬화 대신 **'조회 시점 분리'** 전략을 썼는데, Disk Usage 탭이 열려 있을 때만 실행되도록 제한해 기본 2초 주기 새로고침을 오염시키지 않게 했습니다.\n\n**compose-go**(compose-spec/compose-go)는 이 stats 병목과는 무관하지만, docker compose 명령을 매번 shell-out하지 않고 Compose 파일을 in-process로 해석해 문제 컨테이너의 service·dependency·volume 맥락을 바로 보여주므로, 벤치마크 수치보다는 원인 파악 시간을 줄이는 별도 개선으로 구분해뒀습니다.",
    result: "1회차 19.494초→2.091초(9.325배), 2회차 20.092초→2.436초(8.248배), 3회차 19.580초→1.936초(10.113배), 4회차 21.141초→1.879초(11.248배), 5회차 18.343초→1.949초(9.409배)로, 5회 평균 순차 **19.730초**가 병렬 **2.058초**로 줄어 평균 **9.585배** 빨랐습니다.\n\nDocker Go SDK와 조회 시점 분리는 이 수치에 직접 잡히진 않지만, **CLI 프로세스 기동·텍스트 파싱 비용**과 불필요한 daemon 호출을 구조적으로 없앤 부분입니다.",
  },
];

const meshStack = [
  { label: "Java", icon: "/images/icons/java.svg" },
  { label: "Spring Boot", icon: "/images/icons/springboot.svg" },
  { label: "Kubernetes", icon: "/images/icons/kubernetes.svg" },
  { label: "Istio", icon: "/images/icons/istio.svg" },
  { label: "Cilium", icon: "/images/icons/cilium.svg" },
  { label: "k6", icon: "/images/icons/k6.svg" },
  { label: "Python", icon: "/images/icons/python.svg" },
  { label: "Prometheus", icon: "/images/icons/prometheus.svg" },
  { label: "Grafana", icon: "/images/icons/grafana.svg" },
  { label: "Helm", icon: "/images/icons/helm.svg" },
];

const meshWorkloadPillars = [
  { title: "Sync Chain", detail: "gateway→hop-a→hop-b→hop-c 3-hop 동기 체인으로, hop마다 겹겹이 붙는 proxy 왕복과 mTLS 핸드셰이크 누적 비용이 latency에 어떻게 쌓이는지를 봅니다." },
  { title: "Fan-out", detail: "orchestrator가 target 4개를 병렬 호출해, 부분 실패 상황에서 애플리케이션과 Mesh의 retry가 겹칠 때 tail latency와 호출량이 증폭되는지 관찰합니다." },
  { title: "Async (Kafka)", detail: "producer→Kafka→worker 비동기 경로로, Mesh의 L7 기능이 닿지 않는 워크로드에서 CPU 기반 HPA가 큐 적체에 반응하지 못하는 구조적 한계를 재현합니다." },
  { title: "Payload", detail: "대용량 payload를 gateway→processor→storage로 흘려보내, 요청 크기가 커질 때 proxy CPU·네트워크 바이트 비용이 어떻게 늘어나는지 분리해서 봅니다." },
  { title: "Mixed-Resource", detail: "CPU·Memory·I/O를 독립적으로 부하 줄 수 있는 target으로, 자원 경합과 throttling이 애플리케이션과 프록시 중 어디서 발생하는지 구분합니다." },
  { title: "Capacity Discovery & Precision Gate", detail: "5개 패턴 모두 절대 RPS를 정하기 전 geometric+binary search로 포화점(C*)을 먼저 찾고, bootstrap 95% CI가 사전에 정한 정밀도를 통과해야만 profile 간 비교 가능한 조건으로 인정합니다." },
];

const meshResponsibilities = [
  "Java 25 + Spring Boot 4.1로 gateway·orchestrator·producer·worker·workload-target 5개 서비스를 구현해 Sync Chain/Fan-out/Async/Payload/Mixed 5가지 통신 패턴을 재현",
  "Python 기반 Experiment Runner(약 1,600줄)를 구현해 Helm profile 적용부터 Ground Truth 기록, Prometheus·Loki·Tempo·Hubble 조회, raw·summary·report 저장까지 측정 전 과정을 자동화",
  "Geometric+binary search capacity discovery와 seeded randomized block, bootstrap 95% CI 정지 규칙으로 반복측정 정책을 직접 설계하고 ADR로 근거를 기록",
  "VMware Workstation 3-VM(control-plane 1 + worker 2) Kubernetes 1.36을 kubeadm으로 직접 구축하고 Cilium CNI/Gateway·MetalLB·Prometheus/Grafana/Loki/Tempo/OTel 관측 스택을 얹음",
  "Istio Sidecar → Ambient → Waypoint 3가지 데이터플레인을 순서대로 설치·검증하며 실제 호환성 결함(probe 캡처로 인한 crash-loop, NetworkPolicy HBONE 포트 누락)을 근본 원인까지 추적해 해결",
  "App·Sidecar·ztunnel·Waypoint 자원을 분리 수집하고, 독립 2-표본 bootstrap 비교 도구를 직접 구현해 profile 간 통계적으로 유의한 차이만 결론으로 채택",
  "Chaos Mesh 대신 kubectl·기존 앱 파라미터만으로 pod-kill·chain-wide delay 두 fault를 설계해 회복탄력성을 정량 측정",
  "2026-08-03 정전으로 etcd가 손상되자 기록해둔 버전·설정값과 자동화만으로 클러스터 전체를 재구축하고, manifest→raw→summary→claim 링크를 SHA-256으로 재검증해 재현 가능함을 실증",
];

const meshTroubleshooting: TroubleshootingItem[] = [
  {
    number: "01", title: "정밀도 기준이 못 버틸 걸 계산으로 미리 예측하고, 반복측정 정책 자체를 다시 설계",
    problem: "Capacity discovery로 usable capacity(C\\*=28 RPS)를 찾은 뒤, 이 절대 RPS(8/17/22)로 No-Mesh 정식 반복측정을 시작했습니다. 그런데 사전에 정해둔 정밀도 기준(p95 상대 반폭 ≤5%, p99 ≤10%, CPU ≤5%)이 9~11회 시점에 **12~36%**로, 기준 대비 **2~7배** 벗어나 있었습니다. 1/√n 수렴 속도로 15회 상한 도달 시점의 값을 미리 계산해보니, 이대로면 상한을 다 채워도 대부분 통과하지 못할 것으로 예측됐습니다.",
    action: "무작정 반복 횟수를 늘리는 임시방편 대신 원인부터 짚었습니다. 이 클러스터(노드당 allocatable 2 vCPU)의 latency 자체가 **25~45ms대**로 작아서, 상대 비율 기준이 몇 ms 안 되는 절대 오차를 과장하고 있었던 것입니다. 상대 기준은 유지하되 절대(ms/core-s) 기준을 OR 조건으로 추가하는 ADR을 세워 정책을 바꿨고, 이미 돌고 있던 측정 프로세스가 구버전 기준을 메모리에 들고 있어 불필요하게 재측정할 위험까지 발견해 warm-up 구간(측정 낭비가 가장 적은 시점)에 맞춰 안전하게 재시작했습니다.",
    result: "정책 변경만으로 재계산하자 high 조건이 곧바로 통과 판정을 받으며 실효성이 확인됐습니다. 반면 nominal 조건은 15회 상한까지 다 채웠는데도 p99 절대 반폭(9.08ms)이 기준(8ms)을 **8.9%** 초과해, 억지로 통과시키지 않고 결론을 명시적으로 유보했습니다. 이렇게 확정된 8/17/22 RPS는 이후 Sidecar·Ambient·Waypoint 어떤 profile을 측정하든 **다시 낮추지 않고 그대로 재사용**하는 절대 기준이 됐습니다 — 그래야 '동일 조건에서 워크로드별 비용을 비교했다'는 결론이 성립하기 때문입니다. 아래 실측 로그가 이 판단의 원본입니다.",
  },
  {
    number: "02", title: "가장 유력해 보이던 가설(mTLS)을 직접 꺼서 검증하고, 실제로 기각",
    problem: "Profile 간 독립 2-표본 bootstrap 비교(36개 지표 비교) 중 유일하게 3개 부하 조건(8/17/22 RPS) 모두 일관되게 유의했던 지표는 network bytes/request였습니다. Sidecar는 No-Mesh 대비 요청당 **약 49%**(10,200~11,500바이트) 더 많은 바이트를 전송했고, Ambient는 같은 비교에서 **1~2%**만 늘었습니다. 가장 그럴듯한 설명은 'Envoy가 매 hop마다 붙이는 mTLS 핸드셰이크·레코드 오버헤드'였습니다.",
    action: "이 가설을 인상으로 남겨두지 않고 직접 검증했습니다. PeerAuthentication으로 mTLS를 **DISABLE**하고 나머지는 전부 고정한 채, nominal(8 RPS) 조건에서 정식 10~15회 반복측정을 새로 돌렸습니다 — 기존 PERMISSIVE 측정이 15회 상한까지도 정밀도를 통과하지 못했던 것과 달리, 이번엔 **10회 만에** 통과했습니다.",
    result: "결과는 가설을 기각했습니다. mTLS를 꺼도 network bytes/request는 겨우 **341바이트(약 1%)**만 줄었습니다 — Sidecar 전체 오버헤드(49%) 중 mTLS가 설명하는 부분은 최대 3% 남짓이라는 뜻입니다. 측정 도중 latency가 오히려 나빠지는(p95 +12.4ms) 뜻밖의 결과도 나왔지만, 비교 대상이던 기존 baseline과 현재 클러스터의 **Istio 버전이 서로 달랐다**는 confound를 뒤늦게 발견해, 이 latency 결과에는 '확정 아님' 꼬리표를 붙이고 network bytes 결론만 유지했습니다. 그럴듯해 보이는 첫 번째 가설이 실제로는 틀렸다는 것을 직접 측정으로 확인하고, 성공 스토리로 포장하지 않고 그대로 정직하게 기록했습니다.",
    code: {
      caption: "deploy/environments/sidecar-mtls-disabled/values.yaml — 이 profile 하나로 가설을 검증",
      content: `profile: sidecar-mtls-disabled

global:
  tracingSamplingProbability: "1.0"

sidecar:
  enabled: true
  istioNamespace: istio-system
  xdsPort: 15012
  mtlsMode: DISABLE`,
    },
  },
  {
    number: "03", title: "패킷 레벨까지 내려가서야 보인, Waypoint 연결 실패의 진짜 원인",
    problem: "Ambient 위에 orchestrator-service 단일 hop만 Waypoint를 경유하도록 배포했는데, gateway→waypoint 홉은 통과했지만 **waypoint→실제 backend pod 홉**은 계속 실패했습니다. Envoy 관리자 API로는 TCP 연결은 성공하는데 HTTP 요청은 즉시 리셋됐고, 이 연결은 ztunnel access log에도 전혀 잡히지 않았습니다. 노드 co-location 가설을 podAntiAffinity로 반증했지만 동일하게 재현됐고, Istio를 완전히 다른 버전(1.30.3→1.29.6)으로 재설치해도 똑같이 실패해, 한때 **'버전 독립적인 근본 아키텍처 비호환'**으로 결론짓고 조사를 종료했습니다.",
    action: "하지만 이 결론은 다음 날 다시 열어본 조사에서 틀린 것으로 밝혀졌습니다. 이번엔 애플리케이션 로그나 Envoy 통계 대신 처음으로 cilium monitor --type drop으로 **패킷 레벨을 직접** 봤고, 몇 분 만에 'drop (Policy denied) ... :15008 tcp SYN' 로그를 잡았습니다. 원인은 orchestrator-service의 NetworkPolicy가 waypoint로부터의 ingress를 포트 **8080만** 열어두고 HBONE 포트 **15008**을 빠뜨린, 며칠간의 진단 끝에는 허무할 만큼 단순한 템플릿 실수였습니다.",
    result: "'버전이 달라도 똑같이 실패한다'는 관찰 자체는 맞았지만, 거기서 내린 결론이 틀렸습니다 — NetworkPolicy는 Kubernetes/Cilium 리소스라 Istio를 통째로 재설치해도 전혀 바뀌지 않는데, '재설치로 바뀌지 않은 것'을 의심하는 대신 '재설치로 바뀐 것(Istio 자체)'만 의심했던 것입니다. 포트를 추가하자 **20/20, 이어서 50/50 연속 성공**했고, 이번엔 Waypoint 자체의 rq_total 카운터가 요청 수만큼 실제로 증가하는 것까지 확인해(재배포 직후 5연속 curl 성공이 실은 keep-alive 연결 풀이 Waypoint를 완전히 우회한 거짓 양성이었던 앞선 사례를 교훈 삼아) 이번 성공은 거짓 양성이 아님을 검증했습니다.",
    code: {
      caption: "deploy/charts/meshperf/templates/networkpolicies.yaml — 수정된 orchestrator-service ingress (HBONE 포트 추가)",
      content: `{{- if .Values.waypoint.enabled }}
    - from:
        - podSelector:
            matchLabels:
              gateway.networking.k8s.io/gateway-name: {{ .Values.waypoint.orchestratorGatewayName }}
      ports:
        - {protocol: TCP, port: 8080}
        - {protocol: TCP, port: {{ .Values.ambient.hbonePort }}}
    {{- end }}`,
    },
  },
  {
    number: "04", title: "정전으로 etcd가 깨졌고, 그 복구가 뜻하지 않게 재현성 검증이 됐다",
    problem: "회복탄력성 실험 데이터 수집을 마친 직후, 호스트 전원이 끊기면서 control-plane 노드의 etcd가 손상됐습니다(bbolt backend가 자신의 consistent-index를 잃고 존재하지 않는 snapshot 파일을 찾다 panic). Kubernetes control-plane부터 Cilium·MetalLB·관측 스택·Istio Ambient·애플리케이션 Helm 릴리스까지, **클러스터 전체를 처음부터 다시 세워야** 했습니다.",
    action: "손상된 데이터를 먼저 백업한 뒤, kubeadm reset(3노드)→kubeadm init(손상 전 apiserver manifest에서 실측해둔 pod/service CIDR을 그대로 재사용)→worker 재join 순으로 control-plane부터 복구했습니다. 그 위에 Cilium 1.19.6→Gateway API+MetalLB→observability 스택→meshperf Helm(no-mesh values로 먼저 검증)→Istio Ambient→ambient values 전환까지, **기록해둔 버전·설정값과 기존 자동화(Helm chart, Python 실험 러너)만으로** 순서대로 다시 쌓아 올렸습니다.",
    result: "노드 3/3 Ready, Cilium/Hubble/MetalLB 정상, NetworkPolicy 개수가 원래 배포와 **정확히 일치**, SYNC_CHAIN E2E(ping·3-hop chain·fan-out·payload·async)가 전부 통과했고, Python 실험 러너 dry-run도 무효화 요인 없이 `COMPLETED`로 끝났습니다. 측정 데이터 자체는 인시던트 전에 git에 반영돼 있어 전혀 영향받지 않았고, 이 복구 과정 자체가 **'새 환경에서도 같은 결과가 재현되는가'**라는, 원래는 따로 계획했던 검증을 리허설이 아니라 실제 장애 상황에서 증명한 셈이 됐습니다.",
  },
];

type CapacityRow = { targetRps: string; stage: string; result: string; achievedRps: string; errorRate: string; p95: string; p99: string; flag?: boolean };

const capacityDiscoveryRows: CapacityRow[] = [
  { targetRps: "10", stage: "geometric", result: "PASS", achievedRps: "10.004", errorRate: "0%", p95: "34.073", p99: "41.945" },
  { targetRps: "20", stage: "geometric", result: "PASS", achievedRps: "20.004", errorRate: "0%", p95: "30.311", p99: "46.767" },
  { targetRps: "40", stage: "geometric", result: "CAPACITY_FAIL", achievedRps: "39.885", errorRate: "0%", p95: "101.238", p99: "193.956" },
  { targetRps: "30", stage: "refine", result: "CAPACITY_FAIL", achievedRps: "30.002", errorRate: "0%", p95: "68.965", p99: "118.975", flag: true },
  { targetRps: "25", stage: "refine", result: "PASS", achievedRps: "25.003", errorRate: "0%", p95: "54.793", p99: "80.406" },
  { targetRps: "27", stage: "refine (retry-03)", result: "PASS", achievedRps: "27.001", errorRate: "0%", p95: "47.225", p99: "72.835" },
  { targetRps: "28", stage: "refine", result: "PASS (최종 C*)", achievedRps: "28.001", errorRate: "0%", p95: "47.381", p99: "69.087", flag: true },
];

function CapacityDiscoveryEvidence() {
  return (
    <div className="evidence-table-wrap">
      <p className="evidence-code-caption">Evidence · 2026-07-23 capacity discovery raw log (NO_MESH · SYNC_CHAIN 3-hop · payload 1 KiB)</p>
      <table className="evidence-table">
        <thead>
          <tr><th>Target RPS</th><th>단계</th><th>결과</th><th>Achieved RPS</th><th>오류율</th><th>p95 (ms)</th><th>p99 (ms)</th></tr>
        </thead>
        <tbody>
          {capacityDiscoveryRows.map((row) => (
            <tr key={`${row.targetRps}-${row.stage}`} className={row.flag ? "evidence-row-flag" : undefined}>
              <td>{row.targetRps}</td><td>{row.stage}</td><td>{row.result}</td><td>{row.achievedRps}</td><td>{row.errorRate}</td><td>{row.p95}</td><td>{row.p99}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type MeshFitRow = { scenario: string; recommendation: string; evidence: string; rollback: string };

const meshFitRows: MeshFitRow[] = [
  {
    scenario: "네트워크 바이트가 병목 (대역폭 제한 · 대용량 payload · 높은 처리량)",
    recommendation: "Ambient",
    evidence: "network bytes/req +1~2%(Sidecar +49%, Waypoint +16~18% 대비). 단 replica 확장 시 latency·메모리 증가 있음(아래 행 참고)",
    rollback: "network bytes가 예산을 초과하면 즉시 재평가",
  },
  {
    scenario: "mTLS / zero-trust가 필요하지만 비용에 민감",
    recommendation: "Ambient (Sidecar에서 mTLS만 끄는 우회는 효과 없음)",
    evidence: "mTLS는 Sidecar 오버헤드의 ~3%만 설명 — 꺼도 거의 안 줄어듦. Ambient는 mTLS가 사실상 무료(ztunnel이 이미 처리)",
    rollback: "—",
  },
  {
    scenario: "Pod당 메모리가 빠듯한 클러스터 + 서비스당 replica 多",
    recommendation: "Ambient — 단, 아래 예외 필수 확인",
    evidence: "Sidecar 메모리는 replica 1→4에서 120→173MiB(+44%, 선형). Ambient는 방향성 연구(3회)에서 +2%였지만, 정식 반복측정에서는 16.9→30.25MB(+79%, 유의)로 정반대 — '공짜'라고 안심 금지",
    rollback: "replica 확장 전후 ztunnel 메모리를 반드시 재측정",
  },
  {
    scenario: "replica가 많은 서비스의 latency 민감도가 높음",
    recommendation: "주의 — Ambient도 replica 증가에 따라 p99가 나빠진다",
    evidence: "정식 측정 replica 1→4 시 p99 +20%(유의). Sidecar는 오히려 replica가 늘수록 p95가 소폭 개선(부하 분산 효과) — 이 축만 보면 Sidecar가 유리할 수 있음",
    rollback: "p99가 SLA를 넘으면 replica 수를 낮추거나 Sidecar 재검토",
  },
  {
    scenario: "특정 서비스에만 L7(재시도 · circuit breaking · 헤더 기반 라우팅)이 필요",
    recommendation: "Waypoint (선택 경로)",
    evidence: "network bytes가 Ambient·Sidecar 중간(+16~18%). nominal/high 부하에서 latency는 세 profile보다 일관되게 느림(near-saturation에서는 차이 소멸, 원인 미규명). 배포가 까다로움 — NetworkPolicy HBONE 포트 누락 버그를 2건 실제로 발견",
    rollback: "waypoint 인접 NetworkPolicy에 HBONE 포트(15008)가 열려 있는지 반드시 확인",
  },
  {
    scenario: "일반 서비스 간 통신, L7 기능 불필요, latency에 극도로 민감",
    recommendation: "No-Mesh 또는 Ambient (Sidecar와의 비교는 미확정)",
    evidence: "36개 cross-profile latency 비교 중 유의한 건 1건뿐이고 그마저 다음 부하 단계에서 재현 안 됨. 이 환경은 p95 ≈5ms/p99 ≈8ms 미만 차이를 통계적으로 구분하지 못함",
    rollback: "—",
  },
  {
    scenario: "Pod 장애(crash · 재시작)에 대한 자동 복구가 필요",
    recommendation: "모든 profile 동일 (Kubernetes 자체 기능)",
    evidence: "pod-kill 자동 복구는 Deployment의 self-healing이지 mesh profile의 기능이 아님. replica=1이면 fault 중 peak error rate 37.5~73.3%",
    rollback: "가용성이 중요하면 replica ≥2로 유지",
  },
  {
    scenario: "의존 서비스의 latency 저하(체인 전체가 동시에 느려지는 상황)에 대한 내성",
    recommendation: "Ambient는 확인됨(성공률 유지, latency만 비례 증가). 나머지 profile은 미확인",
    evidence: "chain 전체에 50ms/hop 지연을 걸어도 errorRate 0 유지, latency는 injected delay와 거의 정확히 비례. cross-profile 비교는 하지 않음",
    rollback: "—",
  },
];

function WorkloadMeshFitMatrix() {
  return (
    <div className="evidence-table-wrap">
      <p className="evidence-code-caption">Scenario → Mesh Profile 선택 Matrix — 전체 실험 종료 후 확정 (VMware 3-node · 노드당 2 vCPU · SYNC_CHAIN 3-hop · 8/17/22 RPS 범위 안에서만 유효)</p>
      <table className="evidence-table fit-matrix">
        <thead>
          <tr><th>시나리오 / 요구사항</th><th>권장</th><th>근거 · 비용</th><th>Rollback 기준</th></tr>
        </thead>
        <tbody>
          {meshFitRows.map((row) => (
            <tr key={row.scenario}>
              <td>{row.scenario}</td>
              <td className="fit-cell-strong">{row.recommendation}</td>
              <td>{row.evidence}</td>
              <td>{row.rollback}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const profileConfigs = [
  {
    profile: "no-mesh",
    caption: "deploy/environments/no-mesh/values.yaml",
    content: `profile: no-mesh

global:
  tracingSamplingProbability: "1.0"`,
  },
  {
    profile: "sidecar",
    caption: "deploy/environments/sidecar/values.yaml",
    content: `profile: sidecar

global:
  tracingSamplingProbability: "1.0"

sidecar:
  enabled: true
  istioNamespace: istio-system
  xdsPort: 15012`,
  },
  {
    profile: "ambient",
    caption: "deploy/environments/ambient/values.yaml",
    content: `profile: ambient

global:
  tracingSamplingProbability: "1.0"

sidecar:
  enabled: false

ambient:
  enabled: true
  hbonePort: 15008`,
  },
  {
    profile: "waypoint",
    caption: "deploy/environments/waypoint/values.yaml",
    content: `profile: waypoint

global:
  tracingSamplingProbability: "1.0"

sidecar:
  enabled: false

ambient:
  enabled: true
  hbonePort: 15008

waypoint:
  enabled: true
  orchestratorGatewayName: orchestrator-waypoint`,
  },
];

function ProfileConfigGrid() {
  return (
    <div className="profile-config-grid">
      {profileConfigs.map((item) => (
        <div className="evidence-code-wrap" key={item.profile}>
          <p className="evidence-code-caption">{item.caption}</p>
          <pre className="evidence-code"><code>{item.content}</code></pre>
        </div>
      ))}
    </div>
  );
}

function MeshWorkloadOverview() {
  return (
    <div className="cloud-architecture-grid">
      {meshWorkloadPillars.map((pillar) => (
        <div className="cloud-architecture-card" key={pillar.title}>
          <h4>{pillar.title}</h4>
          <p>{pillar.detail}</p>
        </div>
      ))}
    </div>
  );
}

function DockvizPillarOverview() {
  return (
    <div className="cloud-architecture-grid">
      {dockvizPillars.map((pillar) => (
        <div className="cloud-architecture-card" key={pillar.title}>
          <h4>{pillar.title}</h4>
          <p>{pillar.detail}</p>
        </div>
      ))}
    </div>
  );
}

function DockvizFigures() {
  return (
    <div className="architecture-figures dockviz-figures-row">
      <figure>
        <figcaption>Problems 패널 · OOM·재시작 루프·메모리 증가를 심각도별로 분류</figcaption>
        <div className="architecture-image">
          <Image src="/images/dockviz-problems.svg" alt="dockviz Problems 패널" width={900} height={432} />
        </div>
      </figure>
      <figure>
        <figcaption>Disk Usage 패널 · 카테고리별 회수 가능 공간과 Host Storage 진단</figcaption>
        <div className="architecture-image">
          <Image src="/images/dockviz-disk-usage.svg" alt="dockviz Disk Usage 패널" width={815} height={430} />
        </div>
      </figure>
    </div>
  );
}

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

function highlight(text: string) {
  return text.split(/\*\*(.+?)\*\*/g).map((chunk, i) =>
    i % 2 === 1 ? <span className="stat-highlight" key={i}>{chunk}</span> : chunk
  );
}

function paragraphs(text: string) {
  return text.split("\n\n").map((para, i) => <p key={i}>{highlight(para)}</p>);
}

function EvidenceCode({ code }: { code: CodeSnippet }) {
  return (
    <div className="evidence-code-wrap">
      <p className="evidence-code-caption">{code.caption}</p>
      <pre className="evidence-code"><code>{code.content}</code></pre>
    </div>
  );
}

function TroubleshootingCard({ item }: { item: TroubleshootingItem }) {
  return (
    <article className="troubleshooting-card">
      <div className="troubleshooting-heading"><span className="problem-number">{item.number}</span><h3>{item.title}</h3></div>
      <div className="troubleshooting-copy">
        <div className="troubleshooting-block"><b>문제</b><div className="troubleshooting-text">{paragraphs(item.problem)}</div></div>
        <div className="troubleshooting-block"><b>해결</b><div className="troubleshooting-text">{paragraphs(item.action)}</div></div>
        {item.code && <div className="troubleshooting-block"><b>코드</b><EvidenceCode code={item.code} /></div>}
        {item.result && <div className="troubleshooting-block"><b>결과</b><div className="troubleshooting-text">{paragraphs(item.result)}</div></div>}
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

      <section className="project-sheet hero-sheet">
        <div className="project-topline">
          <div><p className="project-label">개인 프로젝트 · dockviz</p><h2>Docker 문제와 디스크 정리를 위한<br /><em>터미널 대시보드</em></h2><p className="project-period">진행기간 · 2026.03 — 진행 중</p></div>
          <div className="role-panel"><p>담당 영역</p><strong>Go / Bubble Tea / Docker SDK</strong><span>기획부터 배포 자동화까지 1인 전체 소유</span></div>
        </div>
        <div className="project-summary">
          <div><h3>프로젝트 목적</h3><p>docker ps, docker stats, docker system df, docker events를 오가며 컨테이너 상태와 디스크 사용량을 따로 확인하는 건 번거롭고, 개별 명령만으로는 놓치는 문제도 있습니다. 실제로 컨테이너를 삭제해도 volume은 남아 17GB가 그대로 디스크를 차지한 사례처럼, docker ps만 보면 이미 끝난 일로 보이는 문제가 실제로는 남아 있을 수 있습니다. dockviz는 이런 신호를 하나의 실시간 터미널 대시보드로 모아, 컨테이너 문제와 디스크 회수 가능 공간을 한 화면에서 보여주는 Go 기반 CLI 도구입니다.</p></div>
        </div>
        <div className="stack-row"><span className="stack-title">기술 스택</span>{dockvizStack.map((item) => <span className="stack-chip" key={item.label}><Image src={item.icon} alt="" width={24} height={24} /><span>{item.label}</span></span>)}</div>
      </section>

      <section className="project-sheet">
        <SectionTitle eyebrow="01 · System Design" title="두 가지 질문에 답하는 구조로 설계" />
        <p className="architecture-overview-lead">dockviz는 &ldquo;지금 컨테이너에 문제가 있는가&rdquo;와 &ldquo;무엇이 디스크를 차지하고, 무엇을 지울 수 있는가&rdquo; 두 질문에 답하는 데 집중합니다. Docker SDK로 데몬과 직접 통신하고, 데몬 없이도 개발·검증할 수 있도록 데모 클라이언트를 같은 인터페이스로 묶었습니다.</p>
        <DockvizPillarOverview />
      </section>

      <section className="project-sheet">
        <SectionTitle eyebrow="02 · Role & Implementation" title="1인 개발로 기획부터 배포까지" />
        <div className="role-layout"><div><h3 className="subheading">주요 구현 및 역할</h3><ul className="check-list">{dockvizResponsibilities.map((item) => <li key={item}>{item}</li>)}</ul></div><DockvizFigures /></div>
      </section>

      <section className="project-sheet troubleshooting-sheet"><SectionTitle eyebrow="03 · Key Fixes" title="검증까지 마친 핵심 개선 2가지" /><div className="troubleshooting-grid">{dockvizTroubleshooting.map((item) => <TroubleshootingCard key={item.number} item={item} />)}</div></section>

      <section className="project-sheet hero-sheet">
        <div className="project-topline">
          <div><p className="project-label">개인 프로젝트 · Mesh Performance (msa-servicemesh)</p><h2>어떤 워크로드에 어떤 서비스 메쉬가 맞는지,<br /><em>인상이 아니라 반복측정으로</em> 검증하다</h2><p className="project-period">진행기간 · 2026.07 — 2026.08 (완료)</p></div>
          <div className="role-panel"><p>담당 영역</p><strong>Performance Engineering / Platform Verification</strong><span>실험 설계부터 인프라 구축, 통계 분석까지 1인 전체 담당</span></div>
        </div>
        <div className="project-summary">
          <div><h3>프로젝트 목적</h3><p>Service Mesh 도입 여부는 흔히 &ldquo;느려질 것이다&rdquo;라는 인상이나, 벤더가 유리한 조건(단순 echo, 저부하)에서 낸 벤치마크로 결정됩니다. 하지만 Sidecar와 Ambient의 비용 구조는 동기 체인, 병렬 fan-out, 비동기 큐, 대용량 payload처럼 워크로드의 통신 패턴에 따라 다르게 나타날 것으로 예상되는데, 이를 직접 측정해 비교한 자료는 흔치 않습니다. 이 질문에 인상이 아니라, 직접 구축한 VMware 3-node 온프레미스 Kubernetes 위에서 통제 가능한 5종 Java MSA 워크로드와 통계적 정지 규칙을 갖춘 자체 측정 자동화로 답한 개인 Performance Engineering 프로젝트입니다. 전체 실험을 마쳤고, 결론은 &ldquo;Ambient가 가장 균형 잡히지만 replica 확장에는 공짜가 아니다&rdquo;처럼 조건이 붙는 형태로 정리했습니다 — 6개 가설 중 1개 확인·2개 부분 확인·3개는 범위 밖으로 명시했습니다.</p></div>
        </div>
        <div className="stack-row"><span className="stack-title">기술 스택</span>{meshStack.map((item) => <span className="stack-chip" key={item.label}><Image src={item.icon} alt="" width={24} height={24} /><span>{item.label}</span></span>)}</div>
      </section>

      <section className="project-sheet">
        <SectionTitle eyebrow="01 · Verification Design" title="워크로드마다 다른 질문을 던지도록 설계한 5가지 통신 패턴" />
        <p className="architecture-overview-lead">단일 echo 벤치마크로는 &ldquo;워크로드별로 무엇이 다른가&rdquo;라는 질문에 답할 수 없습니다. 그래서 실제 MSA에서 반복적으로 나타나는 5가지 통신 패턴을 Java 마이크로서비스로 직접 구현해, 각 패턴이 서로 다른 Mesh 비용 축(hop 누적 지연, retry 증폭, L7 사각지대, payload 비용, 자원 경합)을 드러내도록 설계했습니다. 프로젝트를 마친 시점 기준으로, 이 중 정식 반복측정과 profile 간 통계 비교까지 끝낸 것은 Sync Chain 하나입니다 — 나머지 4개는 E2E 스모크까지만 확인하고, 최종 결론의 적용 범위에서 명시적으로 제외했습니다. 처음부터 5개를 한 번에 다 검증하겠다고 벌이지 않고, 하나를 통계적으로 믿을 수 있는 수준까지 끝내는 쪽을 택한 결과입니다.</p>
        <MeshWorkloadOverview />
      </section>

      <section className="project-sheet">
        <SectionTitle eyebrow="02 · Role & Engineering" title="벤치마크 플랫폼을 설계부터 운영까지 직접 만들다" />
        <div className="role-layout"><div><h3 className="subheading">주요 구현 및 역할</h3><ul className="check-list">{meshResponsibilities.map((item) => <li key={item}>{item}</li>)}</ul></div></div>
        <p className="subsection-lead">4개 profile은 같은 Helm 차트에서 이 values.yaml 한 겹만 바뀝니다 — sidecar.enabled를 끄면 Ambient가 되고, 거기에 waypoint 블록만 얹으면 Waypoint가 됩니다. 워크로드·리소스·NetworkPolicy는 그대로 두고 이 값만 바뀐다는 것이 &ldquo;워크로드별 mesh 비용을 공정하게 비교했다&rdquo;고 주장할 수 있는 근거입니다.</p>
        <ProfileConfigGrid />
      </section>

      <section className="project-sheet troubleshooting-sheet">
        <SectionTitle eyebrow="03 · Workload → Mesh Verification" title="상황별로 어떤 Mesh를 선택해야 하는지, 근거와 함께" />
        <p className="architecture-overview-lead">이 프로젝트가 최종적으로 답해야 했던 것은 &ldquo;profile 순위&rdquo;가 아니라 &ldquo;이 상황에서는 무엇을 골라야 하는가&rdquo;였습니다. 아래 매트릭스는 8개 시나리오 각각에 대해 권장 profile과 그 근거, 그리고 조건이 바뀌면 재검토해야 할 rollback 기준까지 담았습니다. 그 아래는 이 결론에 이르는 과정에서 나온 원본 로그와 실제 발견 3가지, 그리고 측정과 무관하게 프로젝트 신뢰성 자체를 시험했던 사건 1가지입니다.</p>
        <WorkloadMeshFitMatrix />
        <CapacityDiscoveryEvidence />
        <div className="troubleshooting-grid">{meshTroubleshooting.map((item) => <TroubleshootingCard key={item.number} item={item} />)}</div>
        <div className="verdict-block">
          <p className="verdict-label">결론</p>
          <p>No-Mesh는 기준점이고, <b>Ambient가 이 프로젝트가 측정한 범위 안에서 가장 균형 잡힌 선택</b>입니다(network bytes +1~2%, latency는 No-Mesh와 통계적으로 구분 안 됨, mTLS는 사실상 무료). 다만 <b>replica 확장에는 공짜가 아닙니다</b> — p99 +20%, ztunnel 메모리 +79%, 둘 다 정식 신뢰구간으로 확인됐습니다. Sidecar는 network bytes(+49%)와 Pod당 메모리(replica 비례 증가)가 뚜렷한 대가이고, Waypoint는 선택적 L7이 필요할 때 Ambient·Sidecar 사이의 절충안이지만 배포가 까다롭습니다. 6개 가설 중 1개는 확인, 2개는 부분 확인, 3개는 이번 범위에서 아예 측정하지 않았습니다 — 이 프로젝트의 결론은 개별 수치보다, <b>무엇을 확인했고 무엇을 확인하지 못했는지를 끝까지 구분해서 기록했다는 것</b> 자체입니다.</p>
        </div>
      </section>

      <footer className="portfolio-footer"><span>DoHyun · Cloud Infrastructure Engineer</span><span>© {new Date().getFullYear()}</span></footer>
    </main>
  );
}
