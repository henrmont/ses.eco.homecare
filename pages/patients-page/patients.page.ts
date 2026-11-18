import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { NgxMaskPipe, provideNgxMask } from 'ngx-mask';

// Angular CDK & Material
import { Overlay } from '@angular/cdk/overlay';
import { ComponentType } from '@angular/cdk/portal';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';

// Core & Models (Padrão alias "as User")
import { LoadingComponent } from '../../../core/components/loading-component/loading-component';
import { PatientCare } from '../../models/patient-care.model';
import { Patient } from '../../models/patient.model';
import { Permission } from '../../../core/models/permission.model';
import { Role } from '../../../core/models/role.model';
import { HomecareUser as User } from '../../models/user.model';
import { PatientService } from '../../services/patient.service';
import { AuthService } from '../../services/auth.service';

// Dialog Components
import { PatientArchiveComponent } from '../../components/patients/patient-archive/patient-archive.component';
import { PatientDetailComponent } from '../../components/patients/patient-detail/patient-detail.component';
import { PatientFinishBackComponent } from '../../components/patients/patient-finish-back/patient-finish-back.component';
import { PatientMoveFromOthersComponent } from '../../components/patients/patient-move-from-others/patient-move-from-others.component';
import { PatientUpdateComponent } from '../../components/patients/patient-update/patient-update.component';
import { PatientValidateComponent } from '../../components/patients/patient-validate/patient-validate.component';
import { PatientRequirementComponent } from '../../components/patients/patient-requirement/patient-requirement.component';

// ============================================================================
// CONFIGURAÇÃO DO MÓDULO (Único bloco a ajustar ao replicar para outro módulo)
// ============================================================================
const PAGE_CONFIG = {
  channelName: 'homecare-patients-channel',
  permissionPrefix: 'homecare/',
} as const;

// Estrutura dos dados para exibição das tabelas
interface OwnerPatientTableRow extends PatientCare {
  name: string;
  cns: string;
  document: string;
  document_type: string;
}

interface OthersPatientTableRow extends PatientCare {
  name: string;
  cns: string;
  document: string;
  document_type: string;
  professional: string;
}

type PatientDialogData = {
  patient?: Patient;
  patient_care?: PatientCare;
};

@Component({
  selector: 'app-patients-page',
  standalone: true,
  imports: [
    MatBadgeModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatSortModule,
    MatTableModule,
    MatTabsModule,
    MatTooltipModule,
    NgxMaskPipe,
  ],
  providers: [provideNgxMask()],
  templateUrl: './patients.page.html',
  styleUrl: './patients.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientsPage implements OnInit, OnDestroy {
  // ==========================================
  // Instância própria do canal
  // ==========================================
  private readonly patientsChannel = new BroadcastChannel(PAGE_CONFIG.channelName);

  // ==========================================
  // Injeção de Dependências
  // ==========================================
  private readonly patientService = inject(PatientService);
  private readonly authService = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly overlay = inject(Overlay);
  private readonly destroyRef = inject(DestroyRef);

  // ==========================================
  // ViewChildren / Elementos da View
  // ==========================================
  private readonly ownerSort = viewChild<MatSort>('ownerSort');
  private readonly othersSort = viewChild<MatSort>('othersSort');
  private readonly ownerPaginator = viewChild<MatPaginator>('ownerPaginator');
  private readonly othersPaginator = viewChild<MatPaginator>('othersPaginator');

  // ==========================================
  // Propriedades e Estado Reativo
  // ==========================================
  private loadingDialog?: MatDialogRef<LoadingComponent>;
  private readonly currentUser = computed(() => this.authService.currentUser() as User | null);

  private readonly userPermissions = computed<Set<string>>(() => {
    const roles = this.currentUser()?.roles || [];
    return new Set<string>(
      roles
        .flatMap((role: Role) => role.permissions || [])
        .map((perm: Permission) => perm.name?.trim().toLowerCase())
        .filter((name): name is string => Boolean(name))
    );
  });

  protected readonly displayedOwnerColumns: string[] = [
    'name',
    'cns',
    'document',
    'status',
    'actions',
  ];
  protected readonly displayedOthersColumns: string[] = [
    'name',
    'cns',
    'document',
    'responsible',
    'status',
    'actions',
  ];

  protected readonly ownerDataSource = new MatTableDataSource<OwnerPatientTableRow>([]);
  protected readonly othersDataSource = new MatTableDataSource<OthersPatientTableRow>([]);

  constructor() {
    effect(() => {
      const ownerSort = this.ownerSort();
      const ownerPaginator = this.ownerPaginator();

      if (ownerSort) this.ownerDataSource.sort = ownerSort;
      if (ownerPaginator) this.ownerDataSource.paginator = ownerPaginator;

      const othersSort = this.othersSort();
      const othersPaginator = this.othersPaginator();

      if (othersSort) this.othersDataSource.sort = othersSort;
      if (othersPaginator) this.othersDataSource.paginator = othersPaginator;
    });
  }

  // ==========================================
  // Ciclo de Vida (Hooks)
  // ==========================================
  ngOnInit(): void {
    this.fetchPatients(true);
    this.listenToBroadcastChannel();
  }

  ngOnDestroy(): void {
    this.patientsChannel.close();
  }

  // ==========================================
  // Métodos Acessíveis pelo Template (Protected)
  // ==========================================
  protected applyFilter<T>(event: Event, dataSource: MatTableDataSource<T>): void {
    const filterValue = (event.target as HTMLInputElement).value;
    dataSource.filter = filterValue.trim().toLowerCase();

    if (dataSource.paginator) {
      dataSource.paginator.firstPage();
    }
  }

  /**
   * Retorna `true` quando o botão deve ficar DESABILITADO (`[disabled]="checkPermissions('...')"`)
   */
  protected checkPermissions(permissionName: string): boolean {
    const permissions = this.userPermissions();
    if (permissions.size === 0) return true;

    const target = permissionName.trim().toLowerCase();
    const hasPermission =
      permissions.has(target) ||
      permissions.has(`${PAGE_CONFIG.permissionPrefix}${target}`);

    return !hasPermission;
  }

  // Ações disparadas pelos botões da tabela
  protected patientDetail(patientCare: PatientCare): void {
    this.openDialog(PatientDetailComponent, { patient_care: patientCare }, '1200px', '700px', false);
  }

  protected patientUpdate(patientCare: PatientCare): void {
    this.openDialog(PatientUpdateComponent, { patient_care: patientCare }, '1200px', '700px');
  }

  protected patientEscorts(patientCare: PatientCare): void {
    // this.openDialog(PatientEscortsComponent, { patient_care: patientCare }, '1200px', 'auto', false);
  }

  protected patientReports(patientCare: PatientCare): void {
    // this.openDialog(PatientReportsComponent, { patient_care: patientCare }, '1200px', 'auto', false);
  }

  protected patientArchive(patientCare: PatientCare): void {
    this.openDialog(PatientArchiveComponent, { patient_care: patientCare }, '400px');
  }

  protected patientMoveFromOthers(patientCare: PatientCare): void {
    this.openDialog(PatientMoveFromOthersComponent, { patient_care: patientCare }, '400px');
  }

  protected patientValidate(patientCare: PatientCare): void {
    this.openDialog(PatientValidateComponent, { patient_care: patientCare }, '400px');
  }

  protected patientFinishBack(patientCare: PatientCare): void {
    this.openDialog(PatientFinishBackComponent, { patient_care: patientCare }, '400px');
  }

  protected patientRequirement(patientCare: PatientCare): void {
    this.openDialog(PatientRequirementComponent, { patient_care: patientCare }, '500px');
  }

  // ==========================================
  // Métodos Privados / Auxiliares
  // ==========================================
  private fetchPatients(showLoading = false): void {
    if (showLoading) this.openLoading();

    this.patientService
      .getPatients()
      .pipe(
        finalize(() => {
          if (showLoading && this.loadingDialog) {
            this.loadingDialog.close();
          }
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (response: PatientCare[]) => {
          const rawData = response || [];

          const owners = rawData
            .filter((item) => item.owner)
            .map((item) => this.mapOwnerPatientRow(item));

          const others = rawData
            .filter((item) => !item.owner)
            .map((item) => this.mapOthersPatientRow(item));

          this.ownerDataSource.data = owners;
          this.othersDataSource.data = others;
        },
        error: () => {
          this.ownerDataSource.data = [];
          this.othersDataSource.data = [];
        },
      });
  }

  private listenToBroadcastChannel(): void {
    this.patientsChannel.onmessage = (message: MessageEvent<string>) => {
      if (message.data === 'update') {
        this.fetchPatients(false);
      }
    };
  }

  private mapOwnerPatientRow(item: PatientCare): OwnerPatientTableRow {
    return {
      ...item,
      name: item.patient?.name || '-',
      cns: item.patient?.cns || '-',
      document: item.patient?.document || '-',
      document_type: item.patient?.document_type || '-',
    };
  }

  private mapOthersPatientRow(item: PatientCare): OthersPatientTableRow {
    return {
      ...item,
      name: item.patient?.name || '-',
      cns: item.patient?.cns || '-',
      document: item.patient?.document || '-',
      document_type: item.patient?.document_type || '-',
      professional: item.user?.professional?.name || '-',
    };
  }

  private openLoading(): void {
    this.loadingDialog = this.dialog.open(LoadingComponent, {
      height: '200px',
      disableClose: true,
      autoFocus: false,
    });
  }

  private openDialog<T>(
    component: ComponentType<T>,
    data: PatientDialogData,
    width = '1200px',
    height = 'auto',
    requiresRefresh = true
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
      .subscribe((result) => {
        if (result && requiresRefresh) {
          this.handlePatientChange();
        }
      });
  }

  private handlePatientChange(): void {
    this.fetchPatients(false);
    this.patientsChannel.postMessage('update');
  }
}