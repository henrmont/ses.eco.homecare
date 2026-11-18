import { Overlay } from '@angular/cdk/overlay';
import { ComponentType } from '@angular/cdk/portal';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { NgxMaskDirective } from 'ngx-mask';

// Angular Material
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

// Core & Models
import { ApiResponse } from '../../../../core/models/api-response.model';
import { MessageService } from '../../../../core/services/message-service';

// Services & Local Components
import { UserService } from '../../../services/user.service';
import { ProfessionalTypesComponent } from '../professional-types/professional-types.component';

export type ProfessionalTypesDialogData = {
  selectedTypes: string[];
};

interface ErrorMessage {
  type: string;
  message: string;
}

@Component({
  selector: 'app-user-create',
  standalone: true,
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    NgxMaskDirective,
    ReactiveFormsModule,
  ],
  templateUrl: './user-create.component.html',
  styleUrl: './user-create.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserCreateComponent {
  // ==========================================
  // Injeção de Dependências
  // ==========================================
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly userService = inject(UserService);
  private readonly messageService = inject(MessageService);
  private readonly dialogRef = inject(MatDialogRef<UserCreateComponent>);
  private readonly dialog = inject(MatDialog);
  private readonly overlay = inject(Overlay);
  private readonly destroyRef = inject(DestroyRef);

  // ==========================================
  // Propriedades e Estado Reativo
  // ==========================================
  protected readonly isSubmitting = signal<boolean>(false);

  protected readonly userForm = this.fb.group({
    name: ['', [Validators.required]],
    email: [
      '',
      [Validators.required, Validators.email],
      [this.userService.emailUserExistsValidator(null)],
    ],
    types: [<string[]>[], [Validators.required]],
    cns: ['', [Validators.required], [this.userService.cnsUserExistsValidator(null)]],
    registration: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(6)]],
  });

  protected readonly errorMessages: Record<string, ErrorMessage[]> = {
    name: [{ type: 'required', message: 'O nome é obrigatório.' }],
    email: [
      { type: 'required', message: 'O e-mail é obrigatório.' },
      { type: 'email', message: 'Formato de e-mail inválido.' },
      { type: 'emailExists', message: 'O e-mail informado já está em uso.' },
    ],
    types: [{ type: 'required', message: 'Selecione ao menos um tipo de profissional.' }],
    cns: [
      { type: 'required', message: 'O CNS é obrigatório.' },
      { type: 'cnsExists', message: 'O CNS informado já está em uso.' },
    ],
    registration: [
      { type: 'required', message: 'A matrícula é obrigatória.' },
      { type: 'minlength', message: 'A matrícula deve ter no mínimo 5 dígitos.' },
      { type: 'maxlength', message: 'A matrícula deve ter no máximo 6 dígitos.' },
    ],
  };

  // ==========================================
  // Métodos Acessíveis pelo Template (Protected)
  // ==========================================
  protected openProfessionalTypesDialog(): void {
    const currentTypes: string[] = this.userForm.controls.types.value;
    this.openDialog(ProfessionalTypesComponent, { selectedTypes: currentTypes });
  }

  protected onSubmit(): void {
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.userForm.disable({ emitEvent: false });

    this.userService
      .createUser(this.userForm.getRawValue())
      .pipe(
        finalize(() => {
          this.isSubmitting.set(false);
          this.userForm.enable({ emitEvent: false });
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (response: ApiResponse) => {
          this.messageService.showMessage(response?.message || 'Usuário cadastrado com sucesso!');
          this.dialogRef.close(true);
        },
        error: (err) => {
          const fallbackError = 'Erro ao criar o usuário.';
          this.messageService.showMessage(err?.error?.message || fallbackError);
        },
      });
  }

  // ==========================================
  // Métodos Privados / Auxiliares
  // ==========================================
  private openDialog<T>(
    component: ComponentType<T>,
    data: ProfessionalTypesDialogData,
    width = '600px',
    height = 'auto'
  ): void {
    this.dialog
      .open(component, {
        width,
        height,
        disableClose: true,
        autoFocus: false,
        scrollStrategy: this.overlay.scrollStrategies.noop(),
        data,
      })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((selectedTypes: string[] | undefined) => {
        if (selectedTypes) {
          this.userForm.controls.types.setValue(selectedTypes);
          this.userForm.controls.types.markAsTouched();
        }
      });
  }
}