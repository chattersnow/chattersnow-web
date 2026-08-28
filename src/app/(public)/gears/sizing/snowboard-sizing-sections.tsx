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
  SNOWBOARD_LENGTH_ROWS,
  SNOWBOARD_BOOT_ROWS,
  SNOWBOARD_BINDING_ROWS,
} from "./sizing-data";

export function SnowboardSizingSections() {
  return (
    <>
      <SizingSection
        id="snowboards"
        title="Snowboards"
        description="Board length is chosen from height, weight, and riding style. A quick rule of thumb: stand the board on its tail — it should land somewhere between your chin and nose. Freestyle/park riders usually size shorter for a more playful board; freeride/powder riders size longer for stability and float."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Riding style</TableHead>
              <TableHead>Rider height</TableHead>
              <TableHead>Rider weight</TableHead>
              <TableHead>Board length</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SNOWBOARD_LENGTH_ROWS.map((row, i) => (
              <TableRow key={i}>
                <TableCell>{row.style}</TableCell>
                <TableCell>{row.height}</TableCell>
                <TableCell>{row.weight}</TableCell>
                <TableCell>{row.length}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <SizingDisclaimer>
          Use as a starting point — a shop fitter can fine-tune based on board
          width (for larger boot sizes) and terrain preference.
        </SizingDisclaimer>
      </SizingSection>

      <SizingSection
        id="snowboard-boots"
        title="Snowboard boots"
        description="Snowboard boots are sized close to your true street shoe size for a comfort fit — unlike ski boots' snug mondopoint fit. They should feel snug with toes lightly touching the end when standing, with no heel lift when flexed forward, but shouldn't pinch."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>US men&apos;s</TableHead>
              <TableHead>US women&apos;s</TableHead>
              <TableHead>Mondopoint (cm)</TableHead>
              <TableHead>EU</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SNOWBOARD_BOOT_ROWS.map((row, i) => (
              <TableRow key={i}>
                <TableCell>{row.usMens}</TableCell>
                <TableCell>{row.usWomens}</TableCell>
                <TableCell>{row.mondo}</TableCell>
                <TableCell>{row.eu}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <SizingDisclaimer>
          Sizing varies by brand — always try boots on or check the
          manufacturer&apos;s chart before ordering.
        </SizingDisclaimer>
      </SizingSection>

      <SizingSection
        id="snowboard-bindings"
        title="Snowboard bindings"
        description="Bindings are sized to your boot size range, not directly to the board. They also need to match the board's mounting pattern — most bindings fit standard 4×4 or 2×4 hole patterns, but Burton boards with a channel/3D mount need Burton EST-compatible or channel-adapter bindings."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Binding size</TableHead>
              <TableHead>Compatible US boot size (men&apos;s)</TableHead>
              <TableHead>Compatible US boot size (women&apos;s)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SNOWBOARD_BINDING_ROWS.map((row, i) => (
              <TableRow key={i}>
                <TableCell>{row.size}</TableCell>
                <TableCell>{row.usMens}</TableCell>
                <TableCell>{row.usWomens}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <SizingDisclaimer>
          Check both the boot-size range and the board&apos;s mounting pattern
          before buying — a binding that fits your boot may not fit your board.
        </SizingDisclaimer>
      </SizingSection>
    </>
  );
}
