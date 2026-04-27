import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../helpers/renderWithProviders';
import { CopyButton } from '../../components/shared/CopyButton';
import { Modal } from '../../components/shared/Modal';
import { Spinner } from '../../components/shared/Spinner';
import { Input } from '../../components/shared/Input';

// Spy on clipboard so `toHaveBeenCalledWith` works
let writeTextSpy: ReturnType<typeof vi.spyOn>;

// ---------------------------------------------------------------------------
// CopyButton
// ---------------------------------------------------------------------------
describe('CopyButton', () => {
  beforeEach(() => {
    writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders with default label "Copy"', () => {
    renderWithProviders(<CopyButton text="hello" />);
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(screen.getByText('Copy')).toBeInTheDocument();
  });

  it('renders with a custom label', () => {
    renderWithProviders(<CopyButton text="hello" label="Copy code" />);
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeInTheDocument();
  });

  it('copies text to clipboard on click and shows copied state', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CopyButton text="hello world" />);

    await user.click(screen.getByRole('button'));

    expect(writeTextSpy).toHaveBeenCalledWith('hello world');
    expect(screen.getByText('Copied')).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Copied');
  });

  it('shows displayCopiedLabel when provided after copy', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CopyButton text="hello" displayCopiedLabel="✓ Copied!" copiedLabel="Copied" />,
    );

    await user.click(screen.getByRole('button'));

    expect(screen.getByText('✓ Copied!')).toBeInTheDocument();
  });

  it('shows displayLabel when not copied', () => {
    renderWithProviders(
      <CopyButton text="hello" displayLabel="📋 Copy" label="Copy" />,
    );
    expect(screen.getByText('📋 Copy')).toBeInTheDocument();
  });

  it('resets to default label after timer fires', async () => {
    // Capture the setTimeout callback without blocking userEvent internals
    const originalSetTimeout = globalThis.setTimeout;
    let timerCallback: (() => void) | null = null;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(
      (cb: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) => {
        // Let userEvent / React internals pass through; only capture our timer
        // (the one from CopyButton's useEffect with 1500ms delay)
        if (ms === 1500) {
          timerCallback = cb as () => void;
          return originalSetTimeout(() => {}, 0);
        }
        return originalSetTimeout(cb, ms, ...args);
      },
    );

    const user = userEvent.setup();
    renderWithProviders(<CopyButton text="hello" />);

    await user.click(screen.getByRole('button'));
    expect(screen.getByText('Copied')).toBeInTheDocument();

    // Fire the captured timer callback manually
    expect(timerCallback).not.toBeNull();
    act(() => {
      timerCallback!();
    });

    expect(screen.getByText('Copy')).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Copy');
  });

  it('applies className prop', () => {
    renderWithProviders(<CopyButton text="hello" className="my-btn" />);
    expect(screen.getByRole('button')).toHaveClass('my-btn');
  });
});

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
describe('Modal', () => {
  it('renders nothing when open is false', () => {
    const { container } = renderWithProviders(
      <Modal open={false} onClose={() => {}}>
        <p>Content</p>
      </Modal>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders children when open is true', () => {
    renderWithProviders(
      <Modal open={true} onClose={() => {}}>
        <p>Modal content here</p>
      </Modal>,
    );
    expect(screen.getByText('Modal content here')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('renders title when provided', () => {
    renderWithProviders(
      <Modal open={true} onClose={() => {}} title="Test Title">
        <p>Content</p>
      </Modal>,
    );
    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });

  it('does not render title element when title is not provided', () => {
    const { container } = renderWithProviders(
      <Modal open={true} onClose={() => {}}>
        <p>Content</p>
      </Modal>,
    );
    expect(container.querySelector('h2')).toBeNull();
  });

  it('calls onClose when ESC key is pressed', () => {
    const onClose = vi.fn();
    renderWithProviders(
      <Modal open={true} onClose={onClose}>
        <p>Content</p>
      </Modal>,
    );

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose on ESC when modal is closed', () => {
    const onClose = vi.fn();
    renderWithProviders(
      <Modal open={false} onClose={onClose}>
        <p>Content</p>
      </Modal>,
    );

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when backdrop is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <Modal open={true} onClose={onClose}>
        <p>Content</p>
      </Modal>,
    );

    // Backdrop is the first child div inside the fixed container
    const backdrop = screen.getByRole('dialog').parentElement?.querySelector(
      'div.absolute',
    ) as HTMLElement;
    expect(backdrop).toBeTruthy();
    await user.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when close button in header is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <Modal open={true} onClose={onClose} title="Title">
        <p>Content</p>
      </Modal>,
    );

    await user.click(screen.getByLabelText('Close dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders footer when provided', () => {
    renderWithProviders(
      <Modal
        open={true}
        onClose={() => {}}
        footer={<button>Save</button>}
      >
        <p>Content</p>
      </Modal>,
    );
    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  it('does not render footer element when footer is not provided', () => {
    const { container } = renderWithProviders(
      <Modal open={true} onClose={() => {}}>
        <p>Content</p>
      </Modal>,
    );
    // Footer is rendered in a div with justify-end — check there's no such area
    expect(container.querySelector('.justify-end')).toBeNull();
  });

  it('applies custom width via style prop', () => {
    renderWithProviders(
      <Modal open={true} onClose={() => {}} width={800}>
        <p>Content</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toHaveStyle({ width: '800px' });
  });
});

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------
describe('Spinner', () => {
  it('renders an SVG element', () => {
    const { container } = renderWithProviders(<Spinner />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('has animate-spin class by default', () => {
    const { container } = renderWithProviders(<Spinner />);
    const svg = container.querySelector('svg')!;
    expect(svg.className.baseVal ?? svg.getAttribute('class')).toContain('animate-spin');
  });

  it('renders with default size 20', () => {
    const { container } = renderWithProviders(<Spinner />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('width', '20');
    expect(svg).toHaveAttribute('height', '20');
  });

  it('renders with custom size', () => {
    const { container } = renderWithProviders(<Spinner size={40} />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('width', '40');
    expect(svg).toHaveAttribute('height', '40');
  });

  it('applies custom className', () => {
    const { container } = renderWithProviders(<Spinner className="text-blue-500" />);
    const svg = container.querySelector('svg')!;
    const classStr = svg.className.baseVal ?? svg.getAttribute('class') ?? '';
    expect(classStr).toContain('text-blue-500');
  });

  it('has correct viewBox', () => {
    const { container } = renderWithProviders(<Spinner />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
  });
});

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
describe('Input', () => {
  it('renders an input element', () => {
    renderWithProviders(<Input />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('renders a label when label prop is provided', () => {
    renderWithProviders(<Input label="Username" />);
    expect(screen.getByText('Username')).toBeInTheDocument();
  });

  it('does not render a label when label prop is not provided', () => {
    const { container } = renderWithProviders(<Input />);
    expect(container.querySelector('label')).toBeNull();
  });

  it('shows required indicator when required is true', () => {
    renderWithProviders(<Input label="Email" required />);
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('does not show required indicator when required is false or omitted', () => {
    renderWithProviders(<Input label="Email" />);
    expect(screen.queryByText('*')).not.toBeInTheDocument();
  });

  it('displays error message when error prop is set', () => {
    renderWithProviders(<Input error="This field is required" />);
    expect(screen.getByText('This field is required')).toBeInTheDocument();
  });

  it('does not display error element when no error prop', () => {
    const { container } = renderWithProviders(<Input />);
    expect(container.querySelector('p')).toBeNull();
  });

  it('generates id from label when id is not provided', () => {
    renderWithProviders(<Input label="Full Name" />);
    expect(screen.getByRole('textbox')).toHaveAttribute('id', 'full-name');
  });

  it('uses custom id when provided', () => {
    renderWithProviders(<Input label="Full Name" id="custom-id" />);
    expect(screen.getByRole('textbox')).toHaveAttribute('id', 'custom-id');
  });

  it('label is associated with input via htmlFor', () => {
    renderWithProviders(<Input label="Email" id="email-input" />);
    const label = screen.getByText('Email');
    expect(label).toHaveAttribute('for', 'email-input');
    expect(screen.getByRole('textbox')).toHaveAttribute('id', 'email-input');
  });

  it('applies error border class when error is set', () => {
    const { container } = renderWithProviders(<Input error="err" />);
    const input = container.querySelector('input')!;
    expect(input.className).toContain('border-[var(--color-error)]');
  });

  it('applies normal border class when no error', () => {
    const { container } = renderWithProviders(<Input />);
    const input = container.querySelector('input')!;
    expect(input.className).toContain('border-[var(--color-border)]');
  });

  it('applies custom className', () => {
    const { container } = renderWithProviders(<Input className="my-input" />);
    const input = container.querySelector('input')!;
    expect(input.className).toContain('my-input');
  });

  it('passes through extra HTML input attributes', () => {
    renderWithProviders(<Input placeholder="Enter value" disabled />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('placeholder', 'Enter value');
    expect(input).toBeDisabled();
  });
});
