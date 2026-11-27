# Diagrammer

A dependency-free browser editor for outline-only data flow diagrams.

[Open Diagrammer](https://teoalivanoglou.github.io/diagrammer/)

## Run locally

From this directory, run:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open http://127.0.0.1:4173/ in a current browser. The app starts with a Greek-language example and saves the current diagram in the browser on this address.

## Draw and copy

- Use **Files** to download or open a diagram JSON. To reuse elements, select them and choose **Download selection JSON**, then **Import and place JSON** in the destination diagram.

- Pick a symbol in the toolbox and click the canvas to place it. Drag shapes to move them and use Properties to change their dimensions.
- Turn on **Snap to grid** in Properties to place or drag shapes by their centers. Hold Shift and click two or more symbols to align their edges or centers. With three or more symbols, use **Across** or **Down** to make the gaps between edges equal.
- In Select mode, drag from empty canvas to select enclosed elements. Hold Shift while dragging to add to the current selection.
- Pick **Data flow** and click its start and end. Click a shape to attach to it or click empty canvas for a free endpoint.
- Select an arrow and choose **Curved** to add one quadratic control point. The bend follows the endpoints when shapes move. Drag the square handle to adjust it, or choose **Straight** to remove it. Drag a round endpoint onto the grid to detach it. To reconnect, drop it on a highlighted shape or near the top or bottom rail of a data store.
- Drag a round endpoint along a shape to pin it. It snaps near edge or rail midpoints and the four compass points on a process. The pin follows the shape when it moves or resizes. If two pins cannot form a 120° curve, the editor rejects the new pin. If moving the shapes makes existing pins incompatible, the curve uses automatic positions until the pins are compatible again.
- Arrows between the same two shapes use separate attachment points. The gap grows for thicker lines and fits within the available edge.
- Curved arrows meet each attached shape within a 120° opening centered on the outward direction.
- Double-click a shape or flow to edit its label. Labels inside shapes wrap as you resize the shape and keep any line breaks you enter. Use the **Text** tool for standalone notes. All four font options support Greek.
- Curved arrow labels start outside the bend and follow it when shapes move. Drag a label to anchor it elsewhere along the arrow. The stroke leaves a tight transparent gap behind each overlapping word. Use **Reset label position** to return to automatic placement.
- Change **Line thickness** under Diagram to update every outline and arrow. Hold Shift while selecting items to copy them together, or deselect everything to copy the full diagram.
- Choose **Word** to download an editable .docx with your selection or the full diagram. The default is A4 portrait. Choose A4 landscape under **Files → Word page** for wide diagrams. Open the file in desktop Word and select the diagram, then click an individual shape or label to edit it. Copy the group from Word to move the editable diagram into another Word document. Arrow connections follow shapes in the browser editor.
- Choose **Copy selection** or **Copy diagram** for quick image paste. The clipboard carries a transparent PNG with the labels rendered into the image. The **PNG** button downloads the same image.
- Use **Ctrl+C / Ctrl+V** (or **Cmd+C / Cmd+V** on Mac) to copy and paste editable elements. Point at the canvas to paste at that location.
- Use **Fit diagram** to bring everything into view. Hold Space while dragging with the canvas focused to pan, or use a trackpad.

## Curve debugging

Run `diagrammerDebug(true)` in the browser console and select a curved arrow. The shaded region shows where its square bend handle can sit under the current attachment and endpoint rules. Run `diagrammerDebug(false)` to hide the overlay. Reloading the page also turns it off.

Run the geometry tests with `node --test diagram.test.mjs`.
