function Group() {
  return (
    <div className="absolute contents left-0 top-0">
      <div className="absolute bg-[#d9d9d9] left-px size-px top-[2px]" />
      <div className="absolute bg-[#d9d9d9] left-px size-px top-[5px]" />
      <div className="absolute bg-[#d9d9d9] left-[6px] size-px top-[5px]" />
      <div className="absolute bg-[#d9d9d9] left-[7px] size-px top-px" />
      <div className="absolute bg-[#d9d9d9] left-[6px] size-px top-px" />
      <div className="absolute bg-[#d9d9d9] left-0 size-px top-[5px]" />
      <div className="absolute bg-[#d9d9d9] left-[6px] size-px top-[6px]" />
      <div className="absolute bg-[#d9d9d9] left-[7px] size-px top-[2px]" />
      <div className="absolute bg-[#d9d9d9] left-[2px] size-px top-[2px]" />
      <div className="absolute bg-[#d9d9d9] left-[2px] size-px top-[5px]" />
      <div className="absolute bg-[#d9d9d9] left-[7px] size-px top-[5px]" />
      <div className="absolute bg-[#d9d9d9] left-[6px] size-px top-[2px]" />
      <div className="absolute bg-[#d9d9d9] left-px size-px top-px" />
      <div className="absolute bg-[#d9d9d9] left-px size-px top-[4px]" />
      <div className="absolute bg-[#d9d9d9] left-[6px] size-px top-[4px]" />
      <div className="absolute bg-[#d9d9d9] left-[7px] size-px top-0" />
      <div className="absolute bg-[#d9d9d9] left-[6px] size-px top-0" />
    </div>
  );
}

export default function Frame() {
  return (
    <div className="relative size-full">
      <Group />
    </div>
  );
}