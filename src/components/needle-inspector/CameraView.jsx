export default function CameraView({ title }) {
  return (
    <div className="bg-[#3B3E46] rounded-lg p-3 flex flex-col">
      <div className="flex items-center gap-2 mb-2">
        <span className="h-2.5 w-2.5 bg-[#0CB56C] rounded-full"></span>
        <h2 className="text-sm text-gray-600">{title}</h2>
      </div>
      <div className="bg-[#171C26] flex-1 rounded-md">{/* Canvas for camera feed would go here */}</div>
    </div>
  )
}
