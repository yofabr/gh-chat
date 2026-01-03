import { createFileRoute, useSearch } from "@tanstack/react-router";

export const Route = createFileRoute("/auth/error")({
  component: AuthErrorPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      message: (search.message as string) || "An unknown error occurred",
    };
  },
});

function AuthErrorPage() {
  const { message } = useSearch({ from: "/auth/error" });

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0d1117] text-white">
      <div className="max-w-md w-full mx-auto p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-red-600 rounded-full flex items-center justify-center">
          <svg
            className="w-8 h-8 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold mb-2">Authentication Error</h1>
        <p className="text-gray-400 mb-6">{message}</p>
        <a
          href="/login"
          className="inline-block px-6 py-2 bg-[#238636] hover:bg-[#2ea043] text-white font-semibold rounded-lg transition-colors"
        >
          Try Again
        </a>
      </div>
    </div>
  );
}
