type AdminPageHeaderProps = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
};

export function AdminPageHeader({ title, description, actions }: AdminPageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between text-center sm:text-left">
      <div className="min-w-0 mx-auto sm:mx-0">
        <h2 className="lux-panel-title">{title}</h2>
        {description ? <p className="lux-panel-desc mx-auto sm:mx-0">{description}</p> : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap gap-2 shrink-0 justify-center sm:justify-end">{actions}</div>
      ) : null}
    </div>
  );
}
