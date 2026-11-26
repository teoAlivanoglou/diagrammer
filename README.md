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

- Pick a symbol in the toolbox and click the canvas to place it. Drag shapes to move them and use Properties to change their dimensions.
- Turn on **Snap to grid** in Properties to place or drag shapes by their centers. Hold Shift and click two or more symbols to align their edges or centers. With three or more symbols, use **Across** or **Down** to make the gaps between edges equal.
- Pick **Data flow** and click its start and end. Click a shape to attach to it or click empty canvas for a free endpoint.
- Select an arrow and choose **Curved** to add one quadratic control point. Drag the square handle to adjust the curve, or choose **Straight** to remove it. Drag a round endpoint onto the grid to detach it. To reconnect, drag it near a shape and release when the shape highlights.
- Double-click a shape or flow to edit its label. Use the **Text** tool for standalone notes. All four font options support Greek.
- Change **Line thickness** under Diagram to update every outline and arrow. Hold Shift while selecting items to copy them together, or deselect everything to copy the full diagram.
- Choose **Word** to download an editable .docx with your selection or the full diagram. Open it in desktop Word and select the diagram, then click an individual shape or label to edit it. Copy the group from Word to move the editable diagram into another Word document. Arrow connections follow shapes in the browser editor.
- Choose **Copy selection** or **Copy diagram** for quick image paste. The clipboard carries a transparent PNG with the labels rendered into the image. The **PNG** button downloads the same image.
- Use **Fit diagram** to bring everything into view. Hold Space while dragging with the canvas focused to pan, or use a trackpad.

Run the geometry tests with `node --test diagram.test.mjs`.
