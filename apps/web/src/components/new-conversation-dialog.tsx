'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/field';
import { ApiError } from '@/lib/api';
import { useCreateConversation } from '@/lib/queries';

export function NewConversationDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const create = useCreateConversation();
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);

    try {
      const conversation = await create.mutateAsync({
        subject: String(data.get('subject')),
        customerEmail: String(data.get('customerEmail')),
        customerName: String(data.get('customerName')) || undefined,
        body: String(data.get('body')),
        priority: String(data.get('priority')),
      });
      onClose();
      router.push(`/inbox/${conversation.id}`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'could not open the conversation');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900"
      >
        <p className="text-base font-semibold">New conversation</p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="customerName">Customer name</Label>
            <Input id="customerName" name="customerName" />
          </div>
          <div>
            <Label htmlFor="customerEmail">Customer email</Label>
            <Input id="customerEmail" name="customerEmail" type="email" required />
          </div>
        </div>

        <div>
          <Label htmlFor="subject">Subject</Label>
          <Input id="subject" name="subject" required />
        </div>

        <div>
          <Label htmlFor="priority">Priority</Label>
          <Select id="priority" name="priority" defaultValue="normal">
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </Select>
        </div>

        <div>
          <Label htmlFor="body">First message</Label>
          <Textarea id="body" name="body" rows={4} required />
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Opening' : 'Open conversation'}
          </Button>
        </div>
      </form>
    </div>
  );
}
