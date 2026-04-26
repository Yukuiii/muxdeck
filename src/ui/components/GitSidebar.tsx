import {
  ChevronRight,
  CircleDot,
  Cloud,
  FilePenLine,
  FilePlus,
  FileQuestion,
  FileSymlink,
  FileX,
  GitBranch,
  History,
  Minus,
  Plus,
  RefreshCw,
  Tag,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";
import type { ApplicationError } from "../../application/errors";
import type { GitChange, GitCommit, GitPanelState } from "../../types/gitPanel";

const MAX_VISIBLE_COMMIT_REFS = 2;

type CommitRefType = "local" | "remote" | "tag";

interface CommitRef {
  name: string;
  type: CommitRefType;
}

/**
 * 描述 Git 侧边栏组件的输入属性。
 */
export interface GitSidebarProps {
  data?: GitPanelState;
  error?: ApplicationError;
  isCommitting: boolean;
  isLoading: boolean;
  isStaging: boolean;
  isUnstaging: boolean;
  onCommit(message: string): Promise<boolean>;
  onOpenDiff(path: string, staged: boolean): void;
  onRefresh(): void;
  onStageFile(path: string): Promise<boolean>;
  onStageAll(): Promise<boolean>;
  onUnstageFile(path: string): Promise<boolean>;
  onUnstageAll(): Promise<boolean>;
}

/**
 * 展示当前项目的暂存变更和 Git 提交历史。
 */
export function GitSidebar({
  data,
  error,
  isCommitting,
  isLoading,
  isStaging,
  isUnstaging,
  onCommit,
  onOpenDiff,
  onRefresh,
  onStageFile,
  onStageAll,
  onUnstageFile,
  onUnstageAll,
}: GitSidebarProps): ReactElement {
  const [commitMessage, setCommitMessage] = useState("");
  const [isStagedOpen, setIsStagedOpen] = useState(true);
  const [isChangesOpen, setIsChangesOpen] = useState(true);
  const commitInputRef = useRef<HTMLTextAreaElement | null>(null);
  const unstagedCount = data?.unstagedChanges.length ?? 0;
  const stagedCount = data?.stagedChanges.length ?? 0;
  const historyCount = data?.history.length ?? 0;
  const canCommit = Boolean(
    data?.isRepository &&
      stagedCount > 0 &&
      commitMessage.trim() &&
      !isCommitting &&
      !isStaging &&
      !isUnstaging,
  );
  const canStageAll = Boolean(
    data?.isRepository &&
      unstagedCount > 0 &&
      !isCommitting &&
      !isLoading &&
      !isStaging &&
      !isUnstaging,
  );
  const canUnstageAll = Boolean(
    data?.isRepository &&
      stagedCount > 0 &&
      !isCommitting &&
      !isLoading &&
      !isStaging &&
      !isUnstaging,
  );

  /**
   * 根据内容高度自动调整 commit 输入框高度。
   */
  useEffect(() => {
    const input = commitInputRef.current;

    if (!input) {
      return;
    }

    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  }, [commitMessage]);

  /**
   * 提交当前暂存区变更并在成功后清空输入。
   */
  const handleCommit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canCommit) {
      return;
    }

    const didCommit = await onCommit(commitMessage);

    if (didCommit) {
      setCommitMessage("");
    }
  };

  return (
    <aside className="git-sidebar" aria-label="Git" onMouseEnter={onRefresh}>
      <header className="git-sidebar-header">
        <div className="git-sidebar-title">
          <GitBranch aria-hidden="true" size={14} strokeWidth={2} />
          <span>{data?.branch ?? "Git"}</span>
        </div>
        <button
          className="git-sidebar-icon-button"
          type="button"
          title="刷新 Git 信息"
          onClick={onRefresh}
        >
          <RefreshCw aria-hidden="true" size={14} strokeWidth={2} />
        </button>
      </header>

      {error ? <div className="git-sidebar-message">{error.message}</div> : null}
      {isLoading ? <div className="git-sidebar-message">Loading...</div> : null}
      {data && !data.isRepository ? (
        <div className="git-sidebar-message">Not a git repository</div>
      ) : null}
      {data?.isRepository ? (
        <>
          <form className="git-commit-form" onSubmit={handleCommit}>
            <textarea
              ref={commitInputRef}
              className="git-commit-input"
              rows={1}
              value={commitMessage}
              placeholder={`Commit message${data.branch ? ` on ${data.branch}` : ""}`}
              onChange={(event) => setCommitMessage(event.target.value)}
            />
            <button
              className="git-commit-button"
              type="submit"
              disabled={!canCommit}
            >
              {isCommitting ? "Committing..." : "Commit"}
            </button>
          </form>
          <section className="git-changes-panel">
            <GitChangeGroup
              title="Staged Changes"
              count={stagedCount}
              isOpen={isStagedOpen}
              action={
                <button
                  className="git-change-group-action"
                  type="button"
                  title="取消暂存所有文件"
                  aria-label="取消暂存所有文件"
                  disabled={!canUnstageAll}
                  onClick={() => {
                    void onUnstageAll();
                  }}
                >
                  <Minus aria-hidden="true" size={13} strokeWidth={2.4} />
                </button>
              }
              onToggle={() => setIsStagedOpen((isOpen) => !isOpen)}
            >
              {stagedCount > 0 ? (
                data.stagedChanges.map((change) => (
                  <GitChangeRow
                    key={`staged:${change.status}:${change.path}`}
                    change={change}
                    onOpenDiff={(path) => onOpenDiff(path, true)}
                    stageAction={
                      <button
                        className="git-change-row-stage-button"
                        type="button"
                        title={`取消暂存 ${change.path}`}
                        aria-label={`取消暂存 ${change.path}`}
                        disabled={isStaging || isUnstaging || isCommitting}
                        onClick={(event) => {
                          event.stopPropagation();
                          void onUnstageFile(change.path);
                        }}
                      >
                        <Minus aria-hidden="true" size={13} strokeWidth={2.4} />
                      </button>
                    }
                  />
                ))
              ) : (
                <div className="git-sidebar-empty">No staged changes</div>
              )}
            </GitChangeGroup>
            <GitChangeGroup
              title="Changes"
              count={unstagedCount}
              isOpen={isChangesOpen}
              action={
                <button
                  className="git-change-group-action"
                  type="button"
                  title="暂存所有未暂存变更"
                  aria-label="暂存所有未暂存变更"
                  disabled={!canStageAll}
                  onClick={() => {
                    void onStageAll();
                  }}
                >
                  <Plus aria-hidden="true" size={13} strokeWidth={2.4} />
                </button>
              }
              onToggle={() => setIsChangesOpen((isOpen) => !isOpen)}
            >
              {unstagedCount > 0 ? (
                data.unstagedChanges.map((change) => (
                  <GitChangeRow
                    key={`unstaged:${change.status}:${change.path}`}
                    change={change}
                    onOpenDiff={(path) => onOpenDiff(path, false)}
                    stageAction={
                      <button
                        className="git-change-row-stage-button"
                        type="button"
                        title={`暂存 ${change.path}`}
                        aria-label={`暂存 ${change.path}`}
                        disabled={isStaging || isUnstaging || isCommitting}
                        onClick={(event) => {
                          event.stopPropagation();
                          void onStageFile(change.path);
                        }}
                      >
                        <Plus aria-hidden="true" size={13} strokeWidth={2.4} />
                      </button>
                    }
                  />
                ))
              ) : (
                <div className="git-sidebar-empty">No changes</div>
              )}
            </GitChangeGroup>
          </section>
          <GitSection title="History" count={historyCount} icon={<History size={13} />}>
            {historyCount > 0 ? (
              data.history.map((commit) => (
                <GitCommitRow key={commit.hash} commit={commit} />
              ))
            ) : (
              <div className="git-sidebar-empty">No commits</div>
            )}
          </GitSection>
        </>
      ) : null}
    </aside>
  );
}

interface GitChangeGroupProps {
  title: string;
  count: number;
  isOpen: boolean;
  action?: ReactElement;
  children: ReactElement | ReactElement[];
  onToggle(): void;
}

/**
 * 渲染变更区域内的可折叠文件组。
 */
function GitChangeGroup({
  title,
  count,
  isOpen,
  action,
  children,
  onToggle,
}: GitChangeGroupProps): ReactElement {
  return (
    <section className="git-change-group">
      <div className="git-change-group-header">
        <button className="git-change-group-toggle" type="button" onClick={onToggle}>
          <ChevronRight
            aria-hidden="true"
            size={14}
            strokeWidth={2}
            className={`git-change-group-chevron${isOpen ? " is-open" : ""}`}
          />
          <span className="git-change-group-title">{title}</span>
        </button>
        <div className="git-change-group-header-meta">
          {action}
          <span className="git-section-count">{count}</span>
        </div>
      </div>
      {isOpen ? <div className="git-change-group-body">{children}</div> : null}
    </section>
  );
}

interface GitSectionProps {
  title: string;
  count: number;
  icon?: ReactElement;
  children: ReactElement | ReactElement[];
}

/**
 * 渲染 Git 面板中的一个可计数组。
 */
function GitSection({
  title,
  count,
  icon,
  children,
}: GitSectionProps): ReactElement {
  return (
    <section className="git-section">
      <header className="git-section-header">
        <span className="git-section-title">
          {icon}
          {title}
        </span>
        <span className="git-section-count">{count}</span>
      </header>
      <div className="git-section-body">{children}</div>
    </section>
  );
}

interface GitChangeRowProps {
  change: GitChange;
  onOpenDiff?(path: string): void;
  stageAction?: ReactElement;
}

/**
 * 渲染一条文件变更和可选行级操作按钮。
 */
function GitChangeRow({
  change,
  onOpenDiff,
  stageAction,
}: GitChangeRowProps): ReactElement {
  const isClickable = Boolean(onOpenDiff);

  return (
    <div
      className={`git-change-row${isClickable ? " is-clickable" : ""}`}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? () => onOpenDiff?.(change.path) : undefined}
      onKeyDown={
        isClickable
          ? (event) => {
              if (event.key !== "Enter" && event.key !== " ") {
                return;
              }

              event.preventDefault();
              onOpenDiff?.(change.path);
            }
          : undefined
      }
    >
      <span className={`git-change-status ${statusClassName(change.status)}`}>
        <GitChangeIcon status={change.status} />
      </span>
      <span className="git-change-path">{change.path}</span>
      <span className="git-change-diff" aria-label="Diff line count">
        <span className="is-added">+{change.additions}</span>
        <span className="is-deleted">-{change.deletions}</span>
      </span>
      {stageAction}
    </div>
  );
}

interface GitChangeIconProps {
  status: string;
}

/**
 * 按 Git 状态选择统一的 lucide 文件图标。
 */
function GitChangeIcon({ status }: GitChangeIconProps): ReactElement {
  const iconProps = {
    "aria-hidden": true,
    size: 15,
    strokeWidth: 2,
  };

  if (status === "??") {
    return <FileQuestion {...iconProps} />;
  }

  if (status.startsWith("A")) {
    return <FilePlus {...iconProps} />;
  }

  if (status.startsWith("D")) {
    return <FileX {...iconProps} />;
  }

  if (status.startsWith("R")) {
    return <FileSymlink {...iconProps} />;
  }

  return <FilePenLine {...iconProps} />;
}

interface GitCommitRowProps {
  commit: GitCommit;
}

/**
 * 渲染一条提交历史。
 */
function GitCommitRow({ commit }: GitCommitRowProps): ReactElement {
  return (
    <div className="git-commit-row">
      <div className="git-commit-main">
        <div className="git-commit-subject">{commit.subject}</div>
        <GitCommitRefs refs={commit.refs} />
      </div>
      <div className="git-commit-meta">
        <span>{commit.shortHash}</span>
        <span>{commit.author}</span>
        <span>{commit.relativeTime}</span>
      </div>
    </div>
  );
}

interface GitCommitRefsProps {
  refs: string;
}

/**
 * 渲染一条提交历史携带的分支或远端引用标签。
 */
function GitCommitRefs({ refs }: GitCommitRefsProps): ReactElement | null {
  const commitRefs = parseCommitRefs(refs);
  const visibleRefs = commitRefs.slice(0, MAX_VISIBLE_COMMIT_REFS);
  const hiddenRefCount = commitRefs.length - visibleRefs.length;

  if (commitRefs.length === 0) {
    return null;
  }

  return (
    <div className="git-commit-refs" aria-label="Commit refs">
      {visibleRefs.map((ref) => {
        const Icon = commitRefIcon(ref.type);

        return (
          <span
            className={`git-commit-ref-pill is-${ref.type}`}
            key={`${ref.type}:${ref.name}`}
            title={ref.name}
          >
            <Icon aria-hidden="true" size={12} strokeWidth={2} />
            <span>{ref.name}</span>
          </span>
        );
      })}
      {hiddenRefCount > 0 ? (
        <span
          className="git-commit-ref-pill is-overflow"
          title={commitRefs
            .slice(MAX_VISIBLE_COMMIT_REFS)
            .map((ref) => ref.name)
            .join(", ")}
        >
          +{hiddenRefCount}
        </span>
      ) : null}
    </div>
  );
}

/**
 * 将 git log 的 refs 字段拆分为可展示的引用标签。
 */
function parseCommitRefs(refs: string): CommitRef[] {
  const seenRefs = new Set<string>();

  return refs
    .split(",")
    .map(normalizeCommitRef)
    .filter((ref): ref is CommitRef => Boolean(ref))
    .filter((ref) => {
      const key = `${ref.type}:${ref.name}`;

      if (seenRefs.has(key)) {
        return false;
      }

      seenRefs.add(key);
      return true;
    });
}

/**
 * 清理 git decorate 输出中的 HEAD 和 tag 前缀并标记引用类型。
 */
function normalizeCommitRef(ref: string): CommitRef | null {
  const trimmedRef = ref.trim();

  if (
    !trimmedRef ||
    trimmedRef === "HEAD" ||
    trimmedRef.endsWith("/HEAD") ||
    trimmedRef.includes("/HEAD ->")
  ) {
    return null;
  }

  if (trimmedRef.startsWith("HEAD -> ")) {
    return createCommitRef(trimmedRef.replace("HEAD -> ", ""));
  }

  if (trimmedRef.startsWith("tag: ")) {
    return {
      name: trimmedRef.replace("tag: ", ""),
      type: "tag",
    };
  }

  return createCommitRef(trimmedRef);
}

/**
 * 根据引用名称创建本地或远端分支标签。
 */
function createCommitRef(name: string): CommitRef | null {
  const normalizedName = name.trim();

  if (!normalizedName || normalizedName === "HEAD" || normalizedName.endsWith("/HEAD")) {
    return null;
  }

  return {
    name: normalizedName,
    type: isRemoteRef(normalizedName) ? "remote" : "local",
  };
}

/**
 * 按引用类型选择 history 标签图标。
 */
function commitRefIcon(type: CommitRefType): typeof CircleDot {
  if (type === "remote") {
    return Cloud;
  }

  if (type === "tag") {
    return Tag;
  }

  return CircleDot;
}

/**
 * 判断引用名称是否更像远端分支。
 */
function isRemoteRef(ref: string): boolean {
  return ref.startsWith("origin/") || ref.startsWith("upstream/");
}

/**
 * 将 Git 状态码映射为展示色 class。
 */
function statusClassName(status: string): string {
  if (status === "??") {
    return "is-untracked";
  }

  if (status.startsWith("A")) {
    return "is-added";
  }

  if (status.startsWith("D")) {
    return "is-deleted";
  }

  if (status.startsWith("R")) {
    return "is-renamed";
  }

  return "is-modified";
}
