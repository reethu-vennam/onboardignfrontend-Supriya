import React, { useState } from "react";
import { api } from '@/lib/rest-api';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

interface Props {
  module: string;
  referenceId?: string | null;
}

export const RaiseTicketButton: React.FC<Props> = ({
  module,
  referenceId = null,
}) => {
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    try {
      setLoading(true);

      const token = authService.getToken();
      const user = authService.getUser();

      if (!session || !user) {
        throw new Error("User not authenticated");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPPORT_API_URL}/api/tickets/merchant`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            merchant_id: user.id,
            module,
            reference_id: referenceId,
            title,
            description,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to create ticket");
      }

      toast({
        title: "Ticket Created",
        description: "Support team will contact you shortly.",
      });

      setOpen(false);
      setTitle("");
      setDescription("");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Raise Support Ticket
      </Button>

      {open && (
        <div className="mt-4 p-4 border rounded-lg bg-gray-50 space-y-3">
          <input
            type="text"
            placeholder="Issue title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border px-3 py-2 rounded"
          />

          <textarea
            placeholder="Describe your issue..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full border px-3 py-2 rounded"
          />

          <div className="flex gap-3">
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? "Submitting..." : "Submit Ticket"}
            </Button>

            <Button
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </>
  );
};


