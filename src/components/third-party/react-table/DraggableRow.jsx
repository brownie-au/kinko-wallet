import PropTypes from 'prop-types';

// third-party
import { useDraggable, useDroppable } from '@dnd-kit/core';

// ==============================|| REACT TABLE - DRAGGABLE ROW ||============================== //

export default function DraggableRow({ row, children }) {
  const { setNodeRef: setDropRef } = useDroppable({
    id: `row-${row.id}`
  });

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef
  } = useDraggable({
    id: `row-${row.id}`
  });

  return (
    <tr ref={setDropRef}>
      <td className="text-center">
        <div ref={setDragRef} {...listeners} {...attributes}>
          <i {...attributes} {...listeners} className="ti ti-drag-drop-2 text-secondary f-18" />
        </div>
      </td>
      {children}
    </tr>
  );
}

DraggableRow.propTypes = { row: PropTypes.object, reorderRow: PropTypes.func, children: PropTypes.node };
