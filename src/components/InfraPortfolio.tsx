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
  "utterai-prod-vpc(10.20.0.0/16)를 ap-northeast-2a/2c 2개 AZ에 걸쳐 Public·Private App·Private Pod 3계층 서브넷으로 나누고, EKS Data Plane을 두 AZ 모두에 배치해 AZ 장애에도 워크로드가 유지되도록 구성",
  "VPC CNI Custom Networking으로 Pod 전용 Secondary CIDR(100.64.0.0/17)을 ENIConfig에 연결해 Private Pod Subnet을 노드 서브넷과 분리하고, Prefix Delegation으로 노드당 파드 IP 고갈을 방지",
  "시스템 컴포넌트는 Managed Node Group, 애플리케이션 워크로드는 Karpenter 프로비저닝 노드로 나누고, Argo CD·KEDA·External Secrets Operator·AWS Load Balancer Controller·metrics-server·CoreDNS를 platform 네임스페이스로 모아 클러스터 공통 기능을 운영",
  "SQS·Secrets Manager·ECR용 Interface VPC Endpoint와 S3 Gateway Endpoint를 붙여 AWS API 트래픽이 NAT Gateway를 거치지 않고 프라이빗하게 오가도록 구성하고, 운영자 접근은 AWS Client VPN으로 배스천 없이 처리",
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
  { title: "AI / ML Pipeline", detail: "GPU Worker가 pyannote로 화자를 분리하고 Whisper로 전사한 뒤, RAG Source(S3)에 임베딩해 둔 논문·참고자료를 근거로 Bedrock Claude Haiku 4.5가 언어표본분석 지표와 SOAP 노트 초안을 생성합니다. LLM 호출 이력은 Arize Phoenix로 별도 추적합니다." },
  { title: "Data", detail: "RDS Multi-AZ가 정형 데이터를, ElastiCache Redis가 캐시·세션을, S3가 오디오·리포트 파일을 맡아 컴퓨트 계층과 상태를 분리했습니다." },
  { title: "Messaging", detail: "SQS 큐가 API와 Worker 사이를 비동기로 연결해, 분석 요청이 몰려도 API 응답성과 GPU 자원 사용을 독립적으로 조절할 수 있습니다." },
  { title: "Security", detail: "네임스페이스별 IRSA·ESO로 권한과 시크릿을 최소 범위로 분리하고, NetworkPolicy default-deny와 WAF·Private 엔드포인트로 접근 경로를 통제합니다." },
  { title: "Observability", detail: "Prometheus·Grafana·OpenTelemetry·Phoenix를 연결해 노드·큐·워커·trace를 함께 확인하고, 대시보드와 알림으로 스케일링·장애 신호를 조기에 포착합니다." },
  { title: "Delivery", detail: "Terraform이 VPC부터 EKS·RDS·SQS까지 기반 인프라를, Argo CD + Kustomize overlay가 애플리케이션 배포를 코드화해 dev/prod를 같은 원칙으로 운영합니다." },
];

const dataSecurityLayers = [
  { title: "Domain Segmentation", detail: "PHI(임상 데이터)를 다루는 Patient Data VPC(10.30.0.0/16)와 사용자 식별정보를 다루는 User Data VPC(10.40.0.0/16)를 Application VPC(10.20.0.0/16)와 별도로 두어, 데이터 성격이 다른 두 도메인을 물리적으로 다른 VPC에 격리했습니다." },
  { title: "Network Isolation", detail: "Transit Gateway isolated route tables로 Application VPC → Patient/User Data VPC 방향 접근만 열어두고, Patient Data VPC와 User Data VPC 사이에는 직접 라우팅 경로를 두지 않아 한쪽이 뚫려도 다른 도메인으로 옆으로 번지지 않도록 차단했습니다." },
  { title: "Encryption & Secrets", detail: "도메인별 KMS CMK(Patient CMK·User CMK)로 각 RDS를 분리 암호화하고, Secrets Manager에 Patient secret·User secret을 나눠 저장해 External Secrets Operator가 IRSA 권한으로 필요한 네임스페이스에만 동기화하도록 했습니다." },
  { title: "Availability & Storage", detail: "Patient DB·User DB 모두 RDS Multi-AZ(Primary/Standby)로 동기 복제하고, User Data VPC의 ElastiCache Redis도 Primary/Replica로 이중화했습니다. Application Data·RAG Source 등 S3 버킷은 모두 Private + SSE-S3 + 퍼블릭 액세스 차단으로 운영합니다." },
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

function DataSecurityOverview() {
  return (
    <div className="cloud-architecture-grid">
      {dataSecurityLayers.map((layer) => (
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
        <figcaption>EKS Cluster · 2-AZ VPC/subnet 구성, Managed Node Group + Karpenter 이원화, VPC CNI Custom Networking, platform 컨트롤러 네임스페이스</figcaption>
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
        <p className="architecture-overview-lead">음성 업로드 → 화자분리·전사(pyannote·Whisper) → RAG 기반 LLM 리포트 생성까지 이어지는 비동기 AI 파이프라인을 안정적으로 운영하기 위해 네트워크·컴퓨트·AI/ML·데이터·메시징·보안·관측성·배포 8개 계층을 독립적으로 설계했습니다. SQS로 계층 사이 결합도를 낮춰 트래픽이 몰려도 각 계층을 따로 확장하고, Terraform·Kustomize·Argo CD로 dev·prod 환경을 같은 코드 기반에서 재현할 수 있게 했습니다.</p>
        <FullArchitectureFigure />
        <CloudArchitectureOverview />
      </section>

      <section className="project-sheet">
        <SectionTitle eyebrow="02 · Role & Architecture" title="구조를 만들고, 흐름을 검증했습니다" />
        <div className="role-layout"><div><h3 className="subheading">주요업무 및 상세 역할</h3><ul className="check-list">{responsibilities.map((item) => <li key={item}>{item}</li>)}</ul></div><EksClusterFigure /></div>
      </section>

      <section className="project-sheet">
        <SectionTitle eyebrow="03 · Data Security" title="PHI와 사용자 데이터를 분리한 보안 구조" />
        <p className="architecture-overview-lead">임상 녹음·전사본 같은 PHI와 계정·프로필 같은 사용자 식별정보를 같은 신뢰 경계에 두지 않기 위해, Application VPC와 별도로 Patient Data VPC·User Data VPC를 두고 Transit Gateway isolated route tables로 접근 경로 자체를 제한했습니다. VPC·암호화 키·시크릿을 도메인별로 모두 나눠, 한 도메인이 뚫려도 다른 도메인으로 번지지 않도록 설계했습니다.</p>
        <DataSecurityOverview />
      </section>

      <section className="project-sheet troubleshooting-sheet"><SectionTitle eyebrow="04 · Key Improvements" title="숫자로 증명한 핵심 개선 3가지" /><div className="troubleshooting-grid">{troubleshooting.map((item) => <TroubleshootingCard key={item.number} item={item} />)}</div></section>

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

      <footer className="portfolio-footer"><span>DoHyun · Cloud Infrastructure Engineer</span><span>© {new Date().getFullYear()}</span></footer>
    </main>
  );
}
