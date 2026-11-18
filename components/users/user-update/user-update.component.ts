import { Overlay } from '@angular/cdk/overlay';
import { ComponentType } from '@angular/cdk/portal';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { NgxMaskDirective } from 'ngx-mask';

// Angular Material
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

// Core & Models (Padrão alias "as User")
import { ApiResponse } from '../../../../core/models/api-response.model';
import { MessageService } from '../../../../core/services/message-service';
import { ProfessionalType } from '../../../models/professional-type.model';
import { HomecareUser as User } from '../../../models/user.model';

// Services & Local Components
import { UserService } from '../../../services/user.service';
import { ProfessionalTypesComponent } from '../professional-types/professional-types.component';

type ProfessionalTypesDialogData = {
  selectedTypes: string[];
};

type UserUpdateDialogData = {
  user?: User;
};

interface ErrorMessage {
  type: string;
  message: string;
}

@Component({
  selector: 'app-user-update',
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
  templateUrl: './user-update.component.html',
  styleUrl: './user-update.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserUpdateComponent implements OnInit {
  // ==========================================
  // Injeção de Dependências
  // ==========================================
  protected readonly data = inject<UserUpdateDialogData | null>(MAT_DIALOG_DATA, { optional: true });
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly userService = inject(UserService);
  private readonly messageService = inject(MessageService);
  private readonly dialogRef = inject(MatDialogRef<UserUpdateComponent>);
  private readonly dialog = inject(MatDialog);
  private readonly overlay = inject(Overlay);
  private readonly destroyRef = inject(DestroyRef);

  // ==========================================
  // Propriedades e Estado Reativo
  // ==========================================
  protected userForm!: FormGroup;
  protected readonly isSubmitting = signal<boolean>(false);

  protected readonly errorMessages: Record<string, ErrorMessage[]> = {
    name: [{ type: 'required', message: 'O nome é obrigatório.' }],
    email: [
      { type: 'required', message: 'O e-mail é obrigatório.' },
      { type: 'email', message: 'Formato de e-mail inválido.' },
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
  // Ciclo de Vida (Hooks)
  // ==========================================
  ngOnInit(): void {
    this.initForm();
  }

  // ==========================================
  // Métodos Acessíveis pelo Template (Protected)
  // ==========================================
  protected openProfessionalTypesDialog(): void {
    const currentTypes: string[] = this.userForm.get('types')?.value || [];
    this.openDialog(ProfessionalTypesComponent, { selectedTypes: currentTypes });
  }

  protected onSubmit(): void {
    const userId = this.data?.user?.id;

    if (!userId) {
      this.messageService.showMessage('Identificador do usuário inválido.');
      return;
    }

    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.userForm.disable({ emitEvent: false });

    this.userService
      .updateUser(userId, this.userForm.getRawValue())
      .pipe(
        finalize(() => {
          this.isSubmitting.set(false);
          this.userForm.enable({ emitEvent: false });
          this.userForm.get('email')?.disable({ emitEvent: false });
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (response: ApiResponse) => {
          this.messageService.showMessage(response?.message || 'Usuário atualizado com sucesso!');
          this.dialogRef.close(true);
        },
        error: (err) => {
          const fallbackError = 'Erro ao atualizar o usuário.';
          this.messageService.showMessage(err?.error?.message || fallbackError);
        },
      });
  }

  // ==========================================
  // Métodos Privados
  // ==========================================
  private initForm(): void {
    const professional = this.data?.user?.professional;
    const initialEmail = this.data?.user?.email || null;
    const initialCns = professional?.cns || null;

    const initialTypes: string[] = professional?.types
      ? professional.types.map((t: ProfessionalType | string) => (typeof t === 'string' ? t : t.type))
      : [];

    this.userForm = this.fb.group({
      name: [professional?.name || '', [Validators.required]],
      email: [{ value: initialEmail, disabled: true }, [Validators.required, Validators.email]],
      types: [initialTypes, [Validators.required]],
      cns: [
        initialCns,
        [Validators.required],
        [this.userService.cnsUserExistsValidator(initialCns)],
      ],
      registration: [
        professional?.registration || '',
        [Validators.required, Validators.minLength(5), Validators.maxLength(6)],
      ],
    });
  }

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
          const typesControl = this.userForm.get('types');

          typesControl?.setValue(selectedTypes);
          typesControl?.markAsTouched();
          typesControl?.markAsDirty();
          this.userForm.markAsDirty();
        }
      });
  }
}