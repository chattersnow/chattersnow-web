import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SizingSection, SizingDisclaimer } from "./sizing-section";
import {
  SKI_LENGTH_ROWS,
  SKI_BOOT_MONDOPOINT_ROWS,
  SKI_BINDING_DIN_ROWS,
} from "./sizing-data";

export function SkiSizingSections() {
  return (
    <>
      <SizingSection
        id="skis"
        title="Skis"
        description="Ski length is usually chosen relative to your height and ability level. Shorter skis are easier to turn and forgive mistakes; longer skis are more stable at speed. As a rough guide: beginners size to about chin-to-nose height, intermediates to nose-to-forehead, and advanced skiers to forehead-to-top-of-head."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ability level</TableHead>
              <TableHead>Skier height</TableHead>
              <TableHead>Recommended ski length</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SKI_LENGTH_ROWS.map((row, i) => (
              <TableRow key={i}>
                <TableCell>{row.ability}</TableCell>
                <TableCell>{row.height}</TableCell>
                <TableCell>{row.length}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <SizingDisclaimer>
          Use as a starting point — a shop fitter can dial in exact length based
          on weight, terrain preference, and ski width underfoot.
        </SizingDisclaimer>
      </SizingSection>

      <SizingSection
        id="ski-boots"
        title="Ski boots"
        description="Ski boot sizes are given in mondopoint — your foot length in centimeters — rather than shoe size, so always convert before ordering. A good ski boot fits snugly: toes should just brush the front of the shell when standing upright, and pull back off the toe when you flex forward into a skiing stance, with no heel lift."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mondopoint (cm)</TableHead>
              <TableHead>US men&apos;s</TableHead>
              <TableHead>US women&apos;s</TableHead>
              <TableHead>Foot length (mm)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SKI_BOOT_MONDOPOINT_ROWS.map((row, i) => (
              <TableRow key={i}>
                <TableCell>{row.mondo}</TableCell>
                <TableCell>{row.usMens}</TableCell>
                <TableCell>{row.usWomens}</TableCell>
                <TableCell>{row.footLengthMm}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <SizingDisclaimer>
          Measure your foot length at the end of the day (feet swell), then
          match to the mondopoint column — a shop fitter can confirm shell fit
          and flex.
        </SizingDisclaimer>
      </SizingSection>

      <SizingSection
        id="ski-bindings"
        title="Ski bindings"
        description="DIN (release setting) controls how much force it takes for a binding to release in a fall. It's determined from skier weight, height, age, boot sole length, and skier type — never from weight alone — and should always be set and tested by a certified binding technician, not chosen off a chart."
      >
        <ul className="app-muted list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            <span className="font-medium text-foreground">
              Type I (cautious)
            </span>{" "}
            — beginner-leaning skiers who ski at slower, more controlled speeds
            and prefer an easier release over retention.
          </li>
          <li>
            <span className="font-medium text-foreground">
              Type II (average)
            </span>{" "}
            — the default category for most recreational skiers, balancing
            release ease and retention.
          </li>
          <li>
            <span className="font-medium text-foreground">
              Type III (aggressive)
            </span>{" "}
            — confident, faster skiers who prefer higher retention and accept a
            higher release threshold.
          </li>
        </ul>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Skier weight</TableHead>
              <TableHead>Type I DIN</TableHead>
              <TableHead>Type II DIN</TableHead>
              <TableHead>Type III DIN</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SKI_BINDING_DIN_ROWS.map((row, i) => (
              <TableRow key={i}>
                <TableCell>{row.weight}</TableCell>
                <TableCell>{row.typeI}</TableCell>
                <TableCell>{row.typeII}</TableCell>
                <TableCell>{row.typeIII}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <SizingDisclaimer>
          Reference only, not a substitute for a certified technician. Also
          check boot sole compatibility: GripWalk (rockered) soles need
          GripWalk-compatible or MNC bindings, while flat ISO 5355 soles need
          standard alpine bindings — and confirm the binding&apos;s boot sole
          length (BSL) adjustment range fits your boots.
        </SizingDisclaimer>
      </SizingSection>
    </>
  );
}
