import {
  FilePenLine,
  FilePlus,
  FileQuestion,
  FileSymlink,
  FileX,
  GitBranch,
  History,
  RefreshCw,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";
import type { GitChange, GitCommit, GitPanelState } from "../../types/gitPanel";

/**
 * 描述 Git 侧边栏组件的输入属性。
 */
export interface GitSidebarProps {
  data?: GitPanelState;
  error?: string;
  isCommitting: boolean;
  isLoading: boolean;
  onCommit(message: string): Promise<boolean>;
  onRefresh(): void;
}

/**
 * 展示当前项目的暂存变更和 Git 提交历史。
 */
export function GitSidebar({
  data,
  error,
  isCommitting,
  isLoading,
  onCommit,
  onRefresh,
}: GitSidebarProps): ReactElement {
  const [commitMessage, setCommitMessage] = useState("");
  const commitInputRef = useRef<HTMLTextAreaElement | null>(null);
  const unstagedCount = data?.unstagedChanges.length ?? 0;
  const stagedCount = data?.stagedChanges.length ?? 0;
  const historyCount = data?.history.length ?? 0;
  const canCommit = Boolean(
    data?.isRepository && stagedCount > 0 && commitMessage.trim() && !isCommitting,
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

      {error ? <div className="git-sidebar-message">{error}</div> : null}
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
          <GitSection title="Changes" count={unstagedCount}>
            {unstagedCount > 0 ? (
              data.unstagedChanges.map((change) => (
                <GitChangeRow key={`unstaged:${change.status}:${change.path}`} change={change} />
              ))
            ) : (
              <div className="git-sidebar-empty">No changes</div>
            )}
          </GitSection>
          <GitSection title="Staged Changes" count={stagedCount}>
            {stagedCount > 0 ? (
              data.stagedChanges.map((change) => (
                <GitChangeRow key={`staged:${change.status}:${change.path}`} change={change} />
              ))
            ) : (
              <div className="git-sidebar-empty">No staged changes</div>
            )}
          </GitSection>
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
}

/**
 * 渲染一条暂存区文件变更。
 */
function GitChangeRow({ change }: GitChangeRowProps): ReactElement {
  return (
    <div className="git-change-row">
      <span className={`git-change-status ${statusClassName(change.status)}`}>
        <GitChangeIcon status={change.status} />
      </span>
      <span className="git-change-path">{change.path}</span>
      <span className="git-change-diff" aria-label="Diff line count">
        <span className="is-added">+{change.additions}</span>
        <span className="is-deleted">-{change.deletions}</span>
      </span>
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
      <div className="git-commit-subject">{commit.subject}</div>
      <div className="git-commit-meta">
        <span>{commit.shortHash}</span>
        <span>{commit.author}</span>
        <span>{commit.relativeTime}</span>
      </div>
      {commit.refs ? <div className="git-commit-refs">{commit.refs}</div> : null}
    </div>
  );
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
