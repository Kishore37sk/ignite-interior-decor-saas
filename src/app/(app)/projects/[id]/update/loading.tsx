import { FormPageSkeleton } from "@/features/projects/components/form-skeleton";

export default function UpdateLoading() {
  return (
    <div className="mx-auto w-full max-w-xl">
      <FormPageSkeleton sections={1} fields={6} />
    </div>
  );
}
