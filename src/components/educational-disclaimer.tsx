import { InfoIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function EducationalDisclaimer() {
  return (
    <Alert>
      <InfoIcon />
      <AlertTitle>Educational content only</AlertTitle>
      <AlertDescription>
        These articles are informational starting points, not personalized
        advice, instruction, or a certification program. For anything involving
        safety, equipment setup, or an injury, check with a qualified
        professional — a certified technician, instructor, or medical provider.
      </AlertDescription>
    </Alert>
  );
}
