import PropTypes from 'prop-types';

// third-party
import { useDroppable, useDraggable } from '@dnd-kit/core';

// ==============================|| REACT TABLE - DRAGGABLE COLUMN HEADER ||============================== //

export default function DraggableColumnHeader({ header, className, children }) {
  const { column } = header;

  const { setNodeRef: setDropRef } = useDroppable({
    id: column.id
  });

  const {
    setNodeRef: setDragRef,
    attributes,
    listeners
  } = useDraggable({
    id: column.id
  });

  return (
    <th ref={setDropRef} colSpan={header.colSpan} {...header.column.columnDef.meta} className={`${className} `}>
      <div ref={setDragRef} {...listeners} {...attributes}>
        {children}
      </div>
    </th>
  );
}

DraggableColumnHeader.propTypes = {
  header: PropTypes.object,
  className: PropTypes.string,
  table: PropTypes.object,
  children: PropTypes.node
};
