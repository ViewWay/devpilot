import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { AskUserQuestion } from "../../components/chat/AskUserQuestion";
import type { Question } from "../../components/chat/AskUserQuestion";

describe("AskUserQuestion", () => {
  const textQuestions: Question[] = [
    { id: "q1", text: "What is your name?", required: true, placeholder: "Enter name" },
    { id: "q2", text: "Describe the issue", required: false },
  ];

  const choiceQuestions: Question[] = [
    {
      id: "framework",
      text: "Which framework?",
      required: true,
      choices: [
        { value: "react", label: "React", description: "UI library" },
        { value: "vue", label: "Vue", description: "Progressive framework" },
        { value: "svelte", label: "Svelte" },
      ],
    },
  ];

  it("renders text input questions", () => {
    renderWithProviders(
      <AskUserQuestion questions={textQuestions} onSubmit={vi.fn()} />,
    );

    expect(screen.getByText("What is your name?")).toBeInTheDocument();
    expect(screen.getByText("Describe the issue")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter name")).toBeInTheDocument();
  });

  it("renders choice-based questions", () => {
    renderWithProviders(
      <AskUserQuestion questions={choiceQuestions} onSubmit={vi.fn()} />,
    );

    expect(screen.getByText("Which framework?")).toBeInTheDocument();
    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("Vue")).toBeInTheDocument();
    expect(screen.getByText("Svelte")).toBeInTheDocument();
    expect(screen.getByText("UI library")).toBeInTheDocument();
  });

  it("renders title when provided", () => {
    renderWithProviders(
      <AskUserQuestion
        title="Configuration"
        questions={textQuestions}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText("Configuration")).toBeInTheDocument();
  });

  it("shows required indicator", () => {
    renderWithProviders(
      <AskUserQuestion questions={textQuestions} onSubmit={vi.fn()} />,
    );

    // First question is required, should have *
    const requiredIndicators = screen.getAllByText("*");
    expect(requiredIndicators.length).toBeGreaterThanOrEqual(1);
  });

  it("allows typing in text input", () => {
    renderWithProviders(
      <AskUserQuestion questions={textQuestions} onSubmit={vi.fn()} />,
    );

    const input = screen.getByPlaceholderText("Enter name");
    fireEvent.change(input, { target: { value: "John" } });
    expect(input).toHaveValue("John");
  });

  it("allows selecting a choice", () => {
    renderWithProviders(
      <AskUserQuestion questions={choiceQuestions} onSubmit={vi.fn()} />,
    );

    const reactButton = screen.getByText("React").closest("button")!;
    fireEvent.click(reactButton);

    // React should now be selected (has brand border)
    expect(reactButton.className).toContain("brand");
  });

  it("calls onSubmit with answers when submitted", () => {
    const onSubmit = vi.fn();
    renderWithProviders(
      <AskUserQuestion questions={textQuestions} onSubmit={onSubmit} />,
    );

    // Fill required field
    const input = screen.getByPlaceholderText("Enter name");
    fireEvent.change(input, { target: { value: "John" } });

    // Click submit
    const submitButton = screen.getByText("Submit");
    fireEvent.click(submitButton);

    expect(onSubmit).toHaveBeenCalledWith({ q1: "John" });
  });

  it("validates required fields on submit", () => {
    const onSubmit = vi.fn();
    renderWithProviders(
      <AskUserQuestion questions={textQuestions} onSubmit={onSubmit} />,
    );

    // Click submit without filling required field
    const submitButton = screen.getByText("Submit");
    fireEvent.click(submitButton);

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("disables submit button when required fields are empty", () => {
    renderWithProviders(
      <AskUserQuestion questions={textQuestions} onSubmit={vi.fn()} />,
    );

    const submitButton = screen.getByText("Submit").closest("button")!;
    expect(submitButton.disabled).toBe(true);
  });

  it("enables submit button when all required fields are filled", () => {
    renderWithProviders(
      <AskUserQuestion questions={textQuestions} onSubmit={vi.fn()} />,
    );

    const input = screen.getByPlaceholderText("Enter name");
    fireEvent.change(input, { target: { value: "Alice" } });

    const submitButton = screen.getByText("Submit").closest("button")!;
    expect(submitButton.disabled).toBe(false);
  });
});
