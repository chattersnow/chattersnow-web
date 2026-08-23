import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function StatTile({
  label,
  value,
  caption,
}: {
  label: string;
  value: string | number;
  caption?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="app-muted text-sm font-semibold">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="brand-display text-4xl font-semibold tracking-[-0.04em]">{value}</p>
        {caption && <p className="app-muted mt-2 text-sm">{caption}</p>}
      </CardContent>
    </Card>
  );
}

export function ComingSoonTile({ label, description }: { label: string; description: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="app-muted text-sm font-semibold">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm font-medium">Coming soon</p>
        <p className="app-muted mt-2 text-sm">{description}</p>
      </CardContent>
    </Card>
  );
}
