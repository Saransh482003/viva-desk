import MultiPageShell from '@/components/MultiPageShell';

export default function WorkspaceGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MultiPageShell>{children}</MultiPageShell>;
}
